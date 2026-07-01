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

# ── FAST TAILORING PROMPT ──────────────────────────────────────────────────────
# Only generates the header section (~200-350 tokens output → ~2-4s on 8B)
TAILORING_PROMPT = """You are an ATS resume expert. Tailor ONLY the header for this job.
Use ONLY skills and facts from the candidate's resume. Never invent anything.

RESUME:
{resume_markdown}

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


# ── MARKDOWN SECTION PARSER ────────────────────────────────────────────────────

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
        cert_lines = [re.sub(r'^[-*+]\s*', '', l).strip()
                      for l in lines[start:end]
                      if re.match(r'^[-*+]\s', l.strip())]
        result['certifications'] = cert_lines

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

        if role_h and not stripped.startswith('-'):
            company = role_h.group(1).strip().strip('*').strip()
            title = role_h.group(2).strip().strip('*').strip()
            dates = (role_h.group(3) or '').strip()
            current = {"company": company, "title": title, "dates": dates,
                       "location": "", "bullets": []}
            out.append(current)
        elif re.match(r'^[-*+]\s', stripped) and current is not None:
            bullet = re.sub(r'^[-*+]\s*', '', stripped).strip()
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
                                                    and not stripped.startswith('-')):
            name = re.sub(r'^#{2,3}\s+|\*\*', '', stripped).strip()
            current = {"name": name, "links": "", "bullets": []}
            out.append(current)
        elif re.match(r'^[-*+]\s', stripped) and current is not None:
            bullet = re.sub(r'^[-*+]\s*', '', stripped).strip()
            if 'github' in bullet.lower() or 'gitlab' in bullet.lower() or 'http' in bullet.lower():
                current['links'] = bullet
            else:
                current['bullets'].append(bullet)
        elif current is not None and not stripped.startswith('#') and len(stripped) < 120:
            if not current['links'] and ('http' in stripped or 'gitlab' in stripped):
                current['links'] = stripped


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

@celery_app.task(bind=True, queue="resume", name="app.workers.resume.generate_resume_task",
                 time_limit=120, soft_time_limit=110)
def generate_resume_task(self, match_id: str, include_cover_letter: bool = False, tone: str = "direct"):
    s = get_settings()
    db = get_db()

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
            timeout=25.0,
        )

        # Generate only the header tailoring (~200-350 tokens → ~2-4s). One
        # bounded retry on provider throttling (429/504) keeps a busy NIM tier
        # from failing the whole task while staying inside the ~30s UX budget.
        def _tailor_call():
            return client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                max_tokens=500,
                temperature=0.1,
                messages=[{"role": "user", "content": TAILORING_PROMPT.format(
                    resume_markdown=resume_markdown[:1500],
                    title=job.get("title", ""),
                    company=job.get("company", ""),
                    description=(job.get("description_snippet") or "")[:800],
                )}],
            )

        try:
            msg = _tailor_call()
        except Exception as exc:
            if any(m in str(exc) for m in ("429", "Too Many Requests", "504", "timeout")):
                log.warning("resume_llm_throttled_retrying", match_id=match_id, error=str(exc)[:200])
                time.sleep(5)
                msg = _tailor_call()
            else:
                raise

        tailored = _extract_json(msg.choices[0].message.content)

        candidate_name = profile.get("full_name", "Candidate")
        docx_bytes = _build_docx(tailored, candidate_name, profile, parsed_sections)

        docx_b64 = (
            "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,"
            + base64.b64encode(docx_bytes).decode()
        )

        # ── COVER LETTER (optional) ──────────────────────────────────────────
        cover_letter_b64 = None
        if include_cover_letter:
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

        # Update applications table so the Resumes page can surface these docs
        try:
            db.table("applications").update({
                "resume_pdf_url": download_url,
                "cover_letter_pdf_url": cover_letter_url,
            }).eq("match_id", match_id).execute()
        except Exception as app_exc:
            log.warning("applications_resume_url_update_failed", match_id=match_id, error=str(app_exc))

        return {
            "pdf_url": download_url,
            "cover_letter_url": cover_letter_url,
            "resume_id": resume_id,
            "candidate_name": candidate_name,
            "keywords_injected": tailored.get("keywords_injected", []),
        }

    except Exception as exc:
        log.error("resume_generation_failed", match_id=match_id, error=str(exc))
        raise
