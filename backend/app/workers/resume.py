"""
Resume generation worker — tailors resume header to JD, preserves work history from profile.
Fast path: LLM only generates headline + summary + skills (~300 tokens → ~3s on 8B model).
Work experience, projects, education are parsed directly from resume_markdown.
"""
import json
import re
import base64
import io
import time
from app.workers.celery_app import celery_app
from app.database import get_db
from app.config import get_settings
from openai import OpenAI
import structlog

log = structlog.get_logger()

RESUME_TASK_TIME_LIMIT_SECONDS = 30
RESUME_TASK_SOFT_LIMIT_SECONDS = 25
LLM_TIMEOUT_SECONDS = 12

# ── FAST TAILORING PROMPT ──────────────────────────────────────────────────────
# Only generates the header section (~200-350 tokens output → ~2-4s on 8B)
TAILORING_PROMPT = """You are an ATS resume expert. Tailor the header AND the experience bullet
points for this job. Use ONLY skills and facts from the candidate's resume. Never invent
employers, titles, dates, metrics, or technologies not already present.

RESUME:
{resume_markdown}

CURRENT EXPERIENCE (JSON — keep every company/title/date EXACTLY as given; rewrite ONLY the
bullet text to emphasize what this job asks for, reusing the facts already in each bullet):
{experience_json}

JOB:
Title: {title}
Company: {company}
Description: {description}

Return JSON only (no markdown fences, no extra text):
{{
  "headline": "ROLE TITLE | KEYWORD1, KEYWORD2, KEYWORD3 & KEYWORD4",
  "summary_bullets": [
    "<one sentence: seniority, domain, years of experience>",
    "<one sentence: specific tech/skills matching this JD>",
    "<one sentence: one real proof point from resume>"
  ],
  "skills": {{
    "<Category1>": ["skill1", "skill2", "skill3", "skill4"],
    "<Category2>": ["skill1", "skill2", "skill3"],
    "<Category3>": ["skill1", "skill2", "skill3"],
    "<Category4>": ["skill1", "skill2"]
  }},
  "experience_bullets": {{
    "<company name exactly as given>": ["<tailored bullet 1>", "<tailored bullet 2>", "<tailored bullet 3>", "<tailored bullet 4>"]
  }},
  "keywords_injected": ["kw1", "kw2", "kw3", "kw4", "kw5"]
}}"""

COVER_LETTER_PROMPT = """You are an expert career writer. Write a concise, specific cover letter
for this candidate and job. US business-letter conventions.

TONE: {tone}  (direct = crisp and confident; warm = personable; formal = polished and reserved)

RULES:
- 3 short body paragraphs, 2-4 sentences each. No fluff, no clichés.
- P1: hook — why this role/company, and the single strongest reason they fit.
- P2: concrete proof — 1-2 achievements/skills from the resume that map to the JD.
- P3: close — enthusiasm + a forward-looking line. No salary talk.
- NEVER invent employers, titles, or metrics not in the resume.
- Banned: "I am writing to apply", "Highly motivated", "Results-driven", "To whom it may concern".

## Candidate Resume
{resume_markdown}

## Job
Title: {title}
Company: {company}
Description: {description}

Respond ONLY with valid JSON (no markdown fences):
{{
  "greeting": "Dear {company} Hiring Team,",
  "body": ["<paragraph 1>", "<paragraph 2>", "<paragraph 3>"],
  "closing": "Sincerely,"
}}"""


def _extract_json(raw: str) -> dict:
    """Parse model JSON robustly: strip fences, isolate outermost object, repair trailing commas."""
    if not raw:
        raise ValueError("empty LLM response")
    text = raw.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start:end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(re.sub(r",(\s*[}\]])", r"\1", text))


def _dedupe(items: list[str], limit: int) -> list[str]:
    seen = set()
    out = []
    for item in items:
        text = re.sub(r"\s+", " ", str(item or "")).strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= limit:
            break
    return out


def _profile_skill_candidates(profile: dict, resume_markdown: str) -> list[str]:
    raw = profile.get("skills") or []
    if isinstance(raw, str):
        skills = re.split(r"[,;\n]", raw)
    elif isinstance(raw, list):
        skills = [str(s) for s in raw]
    else:
        skills = []

    known = [
        "Python", "JavaScript", "TypeScript", "React", "Next.js", "FastAPI",
        "Django", "Flask", "Node.js", "PostgreSQL", "Redis", "Celery",
        "Kubernetes", "Docker", "AWS", "Azure", "GCP", "LLM", "RAG",
        "OpenAI", "NVIDIA", "LangChain", "Evaluation", "DevOps", "SRE",
        "CI/CD", "Terraform", "SQL", "Machine Learning",
    ]
    resume_text = resume_markdown.lower()
    discovered = [skill for skill in known if skill.lower() in resume_text]
    return _dedupe([*skills, *discovered], 24)


def _fallback_tailoring(profile: dict, job: dict, resume_markdown: str) -> dict:
    """Local no-LLM tailoring used when the model is slow/unavailable.

    This keeps the product promise: the user gets a useful DOCX even if the LLM
    path times out. It only reuses profile/resume facts and job keywords.
    """
    title = (job.get("title") or "Target Role").strip()
    job_text = " ".join([
        title,
        job.get("company") or "",
        job.get("description_snippet") or "",
    ]).lower()

    candidates = _profile_skill_candidates(profile, resume_markdown)
    overlap = [
        skill for skill in candidates
        if skill.lower() in job_text or any(part and part in job_text for part in skill.lower().split())
    ]
    keywords = _dedupe([*overlap, *candidates], 10)
    headline_terms = keywords[:4] or ["Execution", "Automation", "Delivery"]

    role_family = title
    if len(role_family) > 64:
        role_family = role_family[:61].rstrip() + "..."

    summary_bullets = [
        f"Experience aligned to {role_family} responsibilities using verified background from the uploaded resume.",
        f"Relevant strengths: {', '.join(headline_terms[:5])}.",
        "Focuses on verified accomplishments and skills that map to this job description without unsupported claims.",
    ]

    delivery = [k for k in keywords if k.lower() in {
        "kubernetes", "docker", "aws", "azure", "gcp", "devops", "sre",
        "ci/cd", "terraform", "redis", "celery",
    }]
    engineering = [k for k in keywords if k not in delivery]

    return {
        "headline": f"{role_family} | {', '.join(headline_terms)}",
        "summary_bullets": summary_bullets,
        "skills": {
            "Relevant Skills": engineering[:8] or headline_terms,
            "Delivery": delivery[:6] or ["Execution", "Automation", "Production Systems"],
        },
        "keywords_injected": keywords,
    }


# ── MARKDOWN SECTION PARSER ────────────────────────────────────────────────────

# Real uploads use •/●/▪ as often as -/*/+ — treat them all as bullets.
_BULLET_RE = re.compile(r'^[-*+•●▪]\s*')
# "08/2023 - Present" / "05/2022 – 07/2022" — the line that marks a job entry.
_DATE_RANGE_RE = re.compile(r'\d{1,2}/\d{4}\s*[-–—]\s*(\d{1,2}/\d{4}|present)', re.IGNORECASE)
# Project header markers: "Name | GitLab: x | Live: y" or any URL.
_PROJECT_LINK_RE = re.compile(r'\b(gitlab|github|live)\s*:|https?://', re.IGNORECASE)


def _parse_headingless(lines: list, result: dict) -> None:
    """Parse resumes with NO markdown headings (the common real-world upload:
    'Company | Title' + 'MM/YYYY - MM/YYYY | Location' + • bullets, projects as
    'Name | GitLab: … | Live: …', trailing 'Certifications:'/'Education:' lines).
    The heading-based parser finds nothing on these, which used to silently drop
    the entire resume body from the generated DOCX."""
    n = len(lines)
    i = 0
    while i < n:
        s = lines[i].strip()
        if not s:
            i += 1
            continue
        low = s.lower()

        if low.startswith('certifications:'):
            certs = [s.split(':', 1)[1].strip(' ;')]
            j = i + 1
            while j < n:
                t = lines[j].strip()
                if (not t or t.lower().startswith('education:')
                        or _BULLET_RE.match(t) or _DATE_RANGE_RE.search(t)):
                    break
                certs.append(t.strip(' ;'))
                j += 1
            result['certifications'] = [c for c in certs if c]
            i = j
            continue

        if low.startswith('education:'):
            result['education'] = s.split(':', 1)[1].strip()
            i += 1
            continue

        # Experience entry: "Company | Title" followed by a date-range line.
        if ('|' in s and not _BULLET_RE.match(s)
                and i + 1 < n and _DATE_RANGE_RE.search(lines[i + 1])):
            company, _, title = s.partition('|')
            meta = [p.strip() for p in lines[i + 1].strip().split('|')]
            entry = {
                "company": company.strip(), "title": title.strip(),
                "dates": meta[0] if meta else '',
                "location": meta[1] if len(meta) > 1 else '',
                "bullets": [],
            }
            i += 2
            while i < n and _BULLET_RE.match(lines[i].strip()):
                b = _BULLET_RE.sub('', lines[i].strip()).strip()
                if b:
                    entry['bullets'].append(b)
                i += 1
            result['experience'].append(entry)
            continue

        # Project entry: header carrying link markers, then its bullets.
        if not _BULLET_RE.match(s) and _PROJECT_LINK_RE.search(s):
            parts = s.split('|')
            proj = {
                "name": parts[0].strip(),
                "links": ' | '.join(p.strip() for p in parts[1:]) if len(parts) > 1 else s,
                "bullets": [],
            }
            i += 1
            while i < n and _BULLET_RE.match(lines[i].strip()):
                b = _BULLET_RE.sub('', lines[i].strip()).strip()
                if b:
                    proj['bullets'].append(b)
                i += 1
            result['projects'].append(proj)
            continue

        i += 1


def _parse_resume_markdown(markdown: str) -> dict:
    """
    Extract structured sections from resume markdown.
    Returns: {experience: [{company, title, dates, location, bullets}],
              projects: [{name, links, bullets}],
              education: str,
              certifications: [str]}
    """
    result = {"experience": [], "projects": [], "education": "", "certifications": []}
    if not markdown:
        return result

    lines = [ln.rstrip() for ln in markdown.split("\n")]
    # Identify section boundaries
    section_map = {}  # section_name -> [start_line_idx, ...]
    section_order = []
    current = None

    for i, line in enumerate(lines):
        h = re.match(r'^#{1,3}\s+(.+)$', line)
        if h:
            heading = h.group(1).lower().strip()
            if any(w in heading for w in ('experience', 'employment', 'work history', 'professional')):
                key = 'experience'
            elif any(w in heading for w in ('project', 'portfolio', 'side project')):
                key = 'projects'
            elif 'education' in heading:
                key = 'education'
            elif any(w in heading for w in ('cert', 'licens', 'award', 'honor')):
                key = 'certifications'
            else:
                key = None
            if key:
                current = key
                section_map.setdefault(key, []).append(i)
                if key not in section_order:
                    section_order.append(key)
            continue

    # Extract experience
    if 'experience' in section_map:
        start = section_map['experience'][0] + 1
        # find next known section after start
        end = len(lines)
        for key in ('projects', 'education', 'certifications'):
            if key in section_map:
                for idx in section_map[key]:
                    if idx > start:
                        end = min(end, idx)
        _parse_experience(lines[start:end], result['experience'])

    # Extract projects
    if 'projects' in section_map:
        start = section_map['projects'][0] + 1
        end = len(lines)
        for key in ('education', 'certifications', 'experience'):
            if key in section_map:
                for idx in section_map[key]:
                    if idx > start:
                        end = min(end, idx)
        _parse_projects(lines[start:end], result['projects'])

    # Extract education (just collect text)
    if 'education' in section_map:
        start = section_map['education'][0] + 1
        end = len(lines)
        for key in ('certifications', 'projects', 'experience'):
            if key in section_map:
                for idx in section_map[key]:
                    if idx > start:
                        end = min(end, idx)
        edu_lines = [l for l in lines[start:end] if l.strip() and not re.match(r'^#{1,3}\s', l)]
        result['education'] = " | ".join(edu_lines[:3])

    # Extract certifications
    if 'certifications' in section_map:
        start = section_map['certifications'][0] + 1
        end = len(lines)
        for key in ('education', 'projects', 'experience'):
            if key in section_map:
                for idx in section_map[key]:
                    if idx > start:
                        end = min(end, idx)
        cert_lines = [_BULLET_RE.sub('', l).strip()
                      for l in lines[start:end]
                      if _BULLET_RE.match(l.strip())]
        result['certifications'] = cert_lines

    # No headings matched (or they carried no content) — fall back to the
    # heading-free layout parser so a real-world upload never loses its body.
    if not result['experience'] and not result['projects']:
        _parse_headingless(lines, result)

    return result


def _parse_experience(lines: list, out: list):
    """Parse experience section lines into structured job entries."""
    current = None
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Role header: **Company** — Title or ### Company | Title
        role_h = re.match(r'^(?:#{2,3}\s+|\*\*)?(.+?)(?:\*\*)?\s*[|—–-]\s*(.+?)(?:\s*[|—–-]\s*(.+))?$', stripped)
        # Also catch bold-only lines like **Company Name**
        bold_only = re.match(r'^\*\*(.+)\*\*$', stripped)

        if role_h and not _BULLET_RE.match(stripped):
            company = role_h.group(1).strip().strip('*').strip()
            title = role_h.group(2).strip().strip('*').strip()
            dates = (role_h.group(3) or '').strip()
            current = {"company": company, "title": title, "dates": dates,
                       "location": "", "bullets": []}
            out.append(current)
        elif _BULLET_RE.match(stripped) and current is not None:
            bullet = _BULLET_RE.sub('', stripped).strip()
            if bullet:
                current['bullets'].append(bullet)
        elif current is not None and not stripped.startswith('#') and len(stripped) < 80:
            # Short non-bullet lines are often dates/location
            if not current['dates']:
                current['dates'] = stripped
            elif not current['location']:
                current['location'] = stripped


def _parse_projects(lines: list, out: list):
    """Parse projects section lines into structured project entries."""
    current = None
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Project headers: ### Name or **Name**
        if re.match(r'^#{2,3}\s+', stripped) or (re.match(r'^\*\*.+\*\*', stripped)
                                                    and not _BULLET_RE.match(stripped)):
            name = re.sub(r'^#{2,3}\s+|\*\*', '', stripped).strip()
            current = {"name": name, "links": "", "bullets": []}
            out.append(current)
        elif _BULLET_RE.match(stripped) and current is not None:
            bullet = _BULLET_RE.sub('', stripped).strip()
            if 'github' in bullet.lower() or 'gitlab' in bullet.lower() or 'http' in bullet.lower():
                current['links'] = bullet
            else:
                current['bullets'].append(bullet)
        elif current is not None and not stripped.startswith('#') and len(stripped) < 120:
            if not current['links'] and ('http' in stripped or 'gitlab' in stripped):
                current['links'] = stripped


def _merge_tailored_bullets(parsed: dict, tailored: dict) -> None:
    """Replace each experience entry's bullets with the LLM's JD-tailored ones,
    matched by company (case-insensitive). Companies, titles, dates, locations
    are NEVER touched — tailoring only rewrites bullet text. Missing/empty/
    malformed model output leaves the original bullets in place."""
    raw = tailored.get("experience_bullets")
    if not isinstance(raw, dict):
        return
    by_company = {}
    for k, v in raw.items():
        if isinstance(v, list):
            cleaned = [re.sub(r"\s+", " ", str(b)).strip() for b in v]
            cleaned = [b for b in cleaned if len(b) > 15]  # drop stubs/junk
            if cleaned:
                by_company[str(k).strip().lower()] = cleaned[:4]
    for role in parsed.get("experience", []):
        new = by_company.get((role.get("company") or "").strip().lower())
        if new:
            role["bullets"] = new


# ── GITLAB LINKS ───────────────────────────────────────────────────────────────
GITLAB_LINKS = {
    "alphaedge": {
        "gitlab": "https://gitlab.com/kandadamukesh8/alphaedge",
        "live": "https://proud-meadow-01b42b810.7.azurestaticapps.net/",
    },
    "pawvital": {
        "gitlab": "https://gitlab.com/kandadamukesh8/pawvital-ai",
        "live": "https://pawvital-ai.vercel.app",
    },
    "rizzgpt": {
        "gitlab": "https://gitlab.com/kandadamukesh8/RizzGPT",
        "live": "https://rizzgpt-beta.vercel.app",
    },
}

def _inject_gitlab(link_text: str) -> str:
    """Replace github.com links with GitLab equivalents if known."""
    for key, urls in GITLAB_LINKS.items():
        if key in link_text.lower():
            return f"GitLab: {urls['gitlab']} | Live: {urls['live']}"
    return link_text


# ── DOCX BUILDER ───────────────────────────────────────────────────────────────

def _build_cover_letter_docx(data: dict, candidate_name: str, contact: dict, company: str) -> bytes:
    from datetime import datetime
    from docx import Document
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.9)
    section.right_margin = Inches(0.9)
    doc.styles['Normal'].paragraph_format.space_after = Pt(0)

    def para(text="", bold=False, size=10.5, color=None, align=WD_ALIGN_PARAGRAPH.LEFT,
             space_before=0, space_after=6):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        p.alignment = align
        if text:
            run = p.add_run(text)
            run.bold = bold
            run.font.size = Pt(size)
            run.font.name = 'Calibri'
            if color:
                run.font.color.rgb = RGBColor(*color)
        return p

    para(candidate_name.upper(), bold=True, size=18, color=(0x1A, 0x1A, 0x2E), space_after=1)
    contact_bits = [contact.get(k) for k in ("email", "phone", "location", "linkedin") if contact.get(k)]
    para("  ·  ".join(contact_bits), size=9, color=(0x6B, 0x72, 0x80), space_after=10)
    try:
        para(datetime.now().strftime("%B %d, %Y"), size=10.5, space_after=10)
    except Exception:
        pass
    if company:
        para(f"{company} — Hiring Team", size=10.5, space_after=10)
    para(data.get("greeting", "Dear Hiring Team,"), size=10.5, space_after=8)
    for paragraph in data.get("body", []):
        para(paragraph, size=10.5, space_after=8)
    para(data.get("closing", "Sincerely,"), size=10.5, space_before=6, space_after=2)
    para(candidate_name, bold=True, size=10.5)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _build_docx(tailored: dict, candidate_name: str, profile: dict,
                parsed: dict) -> bytes:
    """Build a 1-page ATS-safe DOCX from LLM header fields + parsed resume sections."""
    from docx import Document
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.45)
    section.bottom_margin = Inches(0.45)
    section.left_margin = Inches(0.6)
    section.right_margin = Inches(0.6)
    doc.styles['Normal'].paragraph_format.space_before = Pt(0)
    doc.styles['Normal'].paragraph_format.space_after = Pt(0)

    def add_para(text="", bold=False, size=10, color=None,
                 align=WD_ALIGN_PARAGRAPH.LEFT, space_before=0, space_after=2, italic=False):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        p.alignment = align
        if text:
            run = p.add_run(text)
            run.bold = bold
            run.italic = italic
            run.font.size = Pt(size)
            run.font.name = 'Calibri'
            if color:
                run.font.color.rgb = RGBColor(*color)
        return p

    def add_colored_line():
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        pPr = p._p.get_or_add_pPr()
        pBdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '12')
        bottom.set(qn('w:space'), '1')
        bottom.set(qn('w:color'), '22D3EE')
        pBdr.append(bottom)
        pPr.append(pBdr)
        return p

    def add_section_header(title: str):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(2)
        run = p.add_run(title.upper())
        run.bold = True
        run.font.size = Pt(10.5)
        run.font.name = 'Calibri'
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)
        pPr = p._p.get_or_add_pPr()
        pBdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '6')
        bottom.set(qn('w:space'), '1')
        bottom.set(qn('w:color'), 'C8C8D0')
        pBdr.append(bottom)
        pPr.append(pBdr)
        return p

    def add_bullet(text: str, size=9.5):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.left_indent = Inches(0.15)
        run = p.add_run(text)
        run.font.size = Pt(size)
        run.font.name = 'Calibri'
        return p

    # ── NAME ──
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(1)
    run = p.add_run(candidate_name.upper())
    run.bold = True
    run.font.size = Pt(20)
    run.font.name = 'Calibri'
    run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    # ── HEADLINE ──
    add_para(tailored.get("headline", ""), size=10, color=(0x4B, 0x5C, 0x78),
             space_before=0, space_after=2)
    add_colored_line()

    # ── CONTACT ──
    parts = []
    email = profile.get("email", "")
    phone = profile.get("phone", "")
    location = profile.get("location", "")
    linkedin = profile.get("linkedin_url", "")
    if phone: parts.append(phone)
    if email: parts.append(email)
    if location: parts.append(location)
    if linkedin: parts.append(linkedin.replace("https://", ""))
    parts.append("gitlab.com/kandadamukesh8")
    add_para("  ·  ".join(p for p in parts if p), size=8.5, color=(0x6B, 0x72, 0x80),
             space_before=2, space_after=4)

    # ── PROFESSIONAL SUMMARY ──
    add_section_header("Professional Summary")
    for bullet in tailored.get("summary_bullets", []):
        add_bullet(bullet, size=9.5)

    # ── TECHNICAL SKILLS ──
    skills = tailored.get("skills", {})
    if skills:
        add_section_header("Technical Skills")
        for category, items in skills.items():
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            label = p.add_run(f"{category}: ")
            label.bold = True
            label.font.size = Pt(9.5)
            label.font.name = 'Calibri'
            val = p.add_run(", ".join(items))
            val.font.size = Pt(9.5)
            val.font.name = 'Calibri'

    # ── WORK EXPERIENCE (from parsed markdown) ──
    experience = parsed.get("experience", [])
    if experience:
        add_section_header("Work Experience")
        for role in experience:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(0)
            co = p.add_run(f"{role.get('company', '')}  |  ")
            co.bold = True
            co.font.size = Pt(10)
            co.font.name = 'Calibri'
            title_run = p.add_run(role.get("title", ""))
            title_run.bold = True
            title_run.font.size = Pt(10)
            title_run.font.name = 'Calibri'
            title_run.font.color.rgb = RGBColor(0x22, 0x65, 0xB0)
            dates = role.get('dates', '')
            loc = role.get('location', '')
            meta = "  |  ".join(x for x in [dates, loc] if x)
            if meta:
                add_para(meta, size=9, italic=True, color=(0x6B, 0x72, 0x80),
                         space_before=0, space_after=1)
            for bullet in role.get("bullets", [])[:4]:
                add_bullet(bullet)

    # ── PROJECTS (from parsed markdown) ──
    projects = parsed.get("projects", [])
    if projects:
        add_section_header("Projects")
        for proj in projects[:3]:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(0)
            name_run = p.add_run(proj.get("name", ""))
            name_run.bold = True
            name_run.font.size = Pt(10)
            name_run.font.name = 'Calibri'
            links = _inject_gitlab(proj.get("links", ""))
            if links:
                link_run = p.add_run(f"  |  {links}")
                link_run.font.size = Pt(8.5)
                link_run.font.name = 'Calibri'
                link_run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
            for bullet in proj.get("bullets", [])[:2]:
                add_bullet(bullet)

    # ── CERTIFICATIONS ──
    certs = parsed.get("certifications", [])
    if certs:
        add_section_header("Certifications")
        for cert in certs:
            add_bullet(cert)

    # ── EDUCATION ──
    edu = parsed.get("education", "")
    if edu:
        add_section_header("Education")
        add_para(edu, size=9.5, space_before=2, space_after=0)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── CELERY TASK ────────────────────────────────────────────────────────────────

def _sync_application_resume_links(
    db,
    match: dict,
    match_id: str,
    download_url: str | None,
    cover_letter_url: str | None,
) -> None:
    """Make generated documents durable in the tracker-facing applications table."""
    if not download_url:
        return

    mission = match.get("missions") or {}
    profile = mission.get("profiles") or {}
    user_id = mission.get("user_id") or profile.get("user_id")
    if not user_id:
        log.warning("resume_application_sync_missing_user", match_id=match_id)
        return

    update = {
        "resume_pdf_url": download_url,
        "cover_letter_pdf_url": cover_letter_url,
    }

    existing = (
        db.table("applications")
        .select("id")
        .eq("match_id", match_id)
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    if existing:
        db.table("applications").update(update).eq("match_id", match_id).eq("user_id", user_id).execute()
        return

    job = match.get("jobs") or {}
    db.table("applications").insert({
        "user_id": user_id,
        "match_id": match_id,
        "job_title": job.get("title") or "Untitled role",
        "company": job.get("company") or "Unknown company",
        "overall_score": match.get("overall_score"),
        "grade": match.get("grade"),
        "status": "evaluated",
        **update,
    }).execute()


@celery_app.task(bind=True, queue="resume", name="app.workers.resume.generate_resume_task",
                 time_limit=RESUME_TASK_TIME_LIMIT_SECONDS,
                 soft_time_limit=RESUME_TASK_SOFT_LIMIT_SECONDS)
def generate_resume_task(self, match_id: str, include_cover_letter: bool = False, tone: str = "direct"):
    s = get_settings()
    db = get_db()
    started = time.monotonic()

    try:
        match = (
            db.table("matches")
            .select("*, jobs(*), missions(*, profiles(*))")
            .eq("id", match_id)
            .single()
            .execute()
            .data
        )
        if not match:
            return {"error": "Match not found"}

        job = match["jobs"]
        profile = match["missions"]["profiles"]
        resume_markdown = (profile.get("resume_markdown") or "")

        # Parse work history from markdown (fast, no LLM needed)
        parsed_sections = _parse_resume_markdown(resume_markdown)

        client = OpenAI(
            api_key=s.nvidia_api_key,
            base_url="https://integrate.api.nvidia.com/v1",
            timeout=LLM_TIMEOUT_SECONDS,
        )

        # Compact experience JSON so the model can tailor bullet text while the
        # merge step below guarantees company/title/dates stay verbatim.
        experience_json = json.dumps([
            {"company": e.get("company", ""), "title": e.get("title", ""),
             "bullets": e.get("bullets", [])[:5]}
            for e in parsed_sections.get("experience", [])[:5]
        ], indent=0)

        used_fallback = False
        try:
            # Header + tailored bullets in ONE call (~600-900 tokens → ~5-8s on 8B)
            msg = client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                max_tokens=1000,
                temperature=0.1,
                messages=[{"role": "user", "content": TAILORING_PROMPT.format(
                    resume_markdown=resume_markdown[:1500],
                    experience_json=experience_json[:2500],
                    title=job.get("title", ""),
                    company=job.get("company", ""),
                    description=(job.get("description_snippet") or "")[:800],
                )}],
            )
            tailored = _extract_json(msg.choices[0].message.content)
        except Exception as llm_exc:
            used_fallback = True
            log.warning("resume_llm_fallback", match_id=match_id, error=str(llm_exc))
            tailored = _fallback_tailoring(profile, job, resume_markdown)

        # Swap in JD-tailored bullet text where the model provided it; the
        # original bullets are ALWAYS the fallback so the body never thins out.
        _merge_tailored_bullets(parsed_sections, tailored)

        candidate_name = profile.get("full_name", "Candidate")
        docx_bytes = _build_docx(tailored, candidate_name, profile, parsed_sections)

        docx_b64 = (
            "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,"
            + base64.b64encode(docx_bytes).decode()
        )

        # ── COVER LETTER (optional) ──────────────────────────────────────────
        cover_letter_b64 = None
        if include_cover_letter and not used_fallback and (time.monotonic() - started) < 18:
            try:
                cl_msg = client.chat.completions.create(
                    model="meta/llama-3.1-8b-instruct",
                    max_tokens=600,
                    temperature=0.1,
                    messages=[{"role": "user", "content": COVER_LETTER_PROMPT.format(
                        tone=tone or "direct",
                        resume_markdown=resume_markdown[:1200],
                        title=job.get("title", ""),
                        company=job.get("company", ""),
                        description=(job.get("description_snippet") or "")[:800],
                    )}],
                )
                cl_data = _extract_json(cl_msg.choices[0].message.content)
                cl_bytes = _build_cover_letter_docx(
                    cl_data, candidate_name,
                    {"email": profile.get("email", ""), "linkedin": profile.get("linkedin_url", "")},
                    job.get("company", ""),
                )
                cover_letter_b64 = (
                    "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,"
                    + base64.b64encode(cl_bytes).decode()
                )
            except Exception as cl_exc:
                log.warning("cover_letter_generation_failed", match_id=match_id, error=str(cl_exc))

        row = {
            "match_id": match_id,
            "pdf_url": docx_b64,
            "cover_letter_pdf_url": cover_letter_b64,
            "keywords_injected": tailored.get("keywords_injected", []),
            "tailored_markdown": json.dumps(tailored),
        }
        result = db.table("resumes").insert(row).execute()
        resume_id = result.data[0]["id"] if result.data else None

        db.table("matches").update({"resume_ready": True}).eq("id", match_id).execute()

        # RELATIVE API paths only — never a hardcoded prod host in generated DB
        # rows. The frontend joins these with its configured API origin and
        # fetches them WITH the bearer token (see frontend/lib/doc-url.ts).
        # Mirrors the shape returned by GET /resumes/match/{id} in app/api/resumes.py.
        base_path = f"/api/v1/resumes/{resume_id}" if resume_id else None
        download_url = f"{base_path}/download" if base_path else None
        cover_letter_url = (
            f"{base_path}/cover-letter/download"
            if (base_path and cover_letter_b64) else None
        )

        # Keep generated documents visible after refresh/login even when the
        # user tailored first and had not manually clicked "Track" yet.
        try:
            _sync_application_resume_links(
                db,
                match,
                match_id,
                download_url,
                cover_letter_url,
            )
        except Exception as app_exc:
            log.warning("applications_resume_url_sync_failed", match_id=match_id, error=str(app_exc))

        return {
            "pdf_url": download_url,
            "cover_letter_url": cover_letter_url,
            "resume_id": resume_id,
            "candidate_name": candidate_name,
            "keywords_injected": tailored.get("keywords_injected", []),
            "fallback": used_fallback,
        }

    except Exception as exc:
        log.error("resume_generation_failed", match_id=match_id, error=str(exc))
        raise
