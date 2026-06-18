"""
Resume generation worker — tailors resume to JD using NVIDIA LLM + python-docx.
Follows the 28-rule resume rulebook: business value bullets, JD DNA, 1-page max.
All companies, dates, contact info, education extracted from the actual resume — nothing hardcoded.
"""
import json
import base64
import io
from app.workers.celery_app import celery_app
from app.database import get_db
from app.config import get_settings
from openai import OpenAI
import structlog

log = structlog.get_logger()

# GitLab links — replace any GitHub links from the original resume
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

TAILORING_PROMPT = """You are an ATS resume expert. Tailor this resume for the job posting.

CRITICAL: Use ONLY companies, dates, contact info, and education from the candidate's resume. NEVER invent or rename companies.

RULES:
- Bullet formula: business problem + action + technology + result (12-20 words each)
- Headline: "ROLE TITLE | KEYWORD1, KEYWORD2, KEYWORD3 & KEYWORD4"
- Summary: exactly 3 bullets (career overview, matching stack, one proof point)
- Skills: 4 categories max, only JD-relevant skills
- Work experience: ALL companies from resume, reverse chronological. Most recent = 4 bullets JD-focused. Earlier = 4 bullets different angle. Internship = 3 bullets foundation. Each company sounds DIFFERENT.
- Projects: 2 bullets each. Order by JD fit. Use GitLab links below, NOT GitHub.
- 1 page. No padding. No banned phrases: "Highly motivated", "Results-driven", "Worked on", "Responsible for", "Collaborated with"
- Max 1-2 real metrics in most recent role only. No fake percentages.

GitLab links (always use these):
- AlphaEdge: https://gitlab.com/kandadamukesh8/alphaedge | live: https://proud-meadow-01b42b810.7.azurestaticapps.net/
- PawVital AI: https://gitlab.com/kandadamukesh8/pawvital-ai | live: https://pawvital-ai.vercel.app
- RizzGPT: https://gitlab.com/kandadamukesh8/RizzGPT | live: https://rizzgpt-beta.vercel.app

## Candidate Resume
{resume_markdown}

## Job Posting
Title: {title}
Company: {company}
Description: {description}

Respond ONLY with valid JSON (no markdown fences):
{{
  "headline": "ROLE TITLE | KW1, KW2, KW3 & KW4",
  "contact": {{
    "visa": "<from resume>",
    "phone": "<from resume>",
    "email": "{email}",
    "location": "<from resume>",
    "linkedin": "<from resume without https://>",
    "gitlab": "gitlab.com/kandadamukesh8"
  }},
  "summary_bullets": ["<career overview>", "<matching stack>", "<proof point>"],
  "skills": {{
    "<Category>": ["skill1", "skill2", "skill3"],
    "<Category>": ["skill1", "skill2"],
    "<Category>": ["skill1", "skill2"],
    "<Category>": ["skill1", "skill2"]
  }},
  "work_experience": [
    {{
      "company": "<exact from resume>",
      "title": "<recruiter-friendly for this JD>",
      "dates": "<exact from resume>",
      "location": "<exact from resume>",
      "bullets": ["bullet1", "bullet2", "bullet3", "bullet4"]
    }}
  ],
  "projects": [
    {{
      "name": "<from resume>",
      "gitlab_url": "<matching GitLab URL above>",
      "live_url": "<matching live URL above>",
      "bullets": ["bullet1", "bullet2"]
    }}
  ],
  "certifications": ["<from resume>"],
  "education": {{
    "degree": "<from resume>",
    "school": "<from resume>",
    "graduation": "<from resume>"
  }},
  "keywords_injected": ["kw1", "kw2", "kw3", "kw4", "kw5"]
}}"""


def _build_docx(data: dict, candidate_name: str) -> bytes:
    """Build a 1-page ATS-safe DOCX matching the Kandada template style."""
    from docx import Document
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    doc = Document()

    # Page margins — tight for 1-page fit
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

    contact = data.get("contact", {})

    # NAME
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(1)
    run = p.add_run(candidate_name.upper())
    run.bold = True
    run.font.size = Pt(20)
    run.font.name = 'Calibri'
    run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    # HEADLINE
    add_para(data.get("headline", ""), size=10, color=(0x4B, 0x5C, 0x78),
             space_before=0, space_after=2)

    # BLUE DIVIDER
    add_colored_line()

    # CONTACT INFO
    parts = []
    if contact.get("visa"):
        parts.append(f"Visa: {contact['visa']}")
    if contact.get("phone"):
        parts.append(contact["phone"])
    if contact.get("email"):
        parts.append(contact["email"])
    if contact.get("location"):
        parts.append(contact["location"])
    if contact.get("linkedin"):
        parts.append(contact["linkedin"])
    if contact.get("gitlab"):
        parts.append(contact["gitlab"])
    add_para("  ·  ".join(parts), size=8.5, color=(0x6B, 0x72, 0x80),
             space_before=2, space_after=4)

    # PROFESSIONAL SUMMARY
    add_section_header("Professional Summary")
    for bullet in data.get("summary_bullets", []):
        add_bullet(bullet, size=9.5)

    # TECHNICAL SKILLS
    add_section_header("Technical Skills")
    for category, items in data.get("skills", {}).items():
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

    # WORK EXPERIENCE
    add_section_header("Work Experience")
    for role in data.get("work_experience", []):
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

        meta = f"{role.get('dates', '')}  |  {role.get('location', '')}"
        add_para(meta, size=9, italic=True, color=(0x6B, 0x72, 0x80),
                 space_before=0, space_after=1)
        for bullet in role.get("bullets", []):
            add_bullet(bullet)

    # PROJECTS
    add_section_header("Projects")
    for proj in data.get("projects", []):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(0)
        name_run = p.add_run(proj.get("name", ""))
        name_run.bold = True
        name_run.font.size = Pt(10)
        name_run.font.name = 'Calibri'
        link_text = f"  |  GitLab: {proj.get('gitlab_url', '')}  |  Live: {proj.get('live_url', '')}"
        link_run = p.add_run(link_text)
        link_run.font.size = Pt(8.5)
        link_run.font.name = 'Calibri'
        link_run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
        for bullet in proj.get("bullets", []):
            add_bullet(bullet)

    # CERTIFICATIONS
    certs = data.get("certifications", [])
    if certs:
        add_section_header("Certifications")
        for cert in certs:
            add_bullet(cert)

    # EDUCATION
    edu = data.get("education", {})
    add_section_header("Education")
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(0)
    deg = p.add_run(edu.get("degree", "Bachelor of Science, Computer Science"))
    deg.bold = True
    deg.font.size = Pt(9.5)
    deg.font.name = 'Calibri'
    school_line = f"{edu.get('school', '')}  |  {edu.get('graduation', '')}"
    add_para(school_line, size=9, color=(0x6B, 0x72, 0x80),
             space_before=0, space_after=0)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


@celery_app.task(bind=True, queue="resume", name="app.workers.resume.generate_resume_task")
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

        client = OpenAI(
            api_key=s.nvidia_api_key,
            base_url="https://integrate.api.nvidia.com/v1",
            timeout=150,
        )

        msg = client.chat.completions.create(
            model="meta/llama-3.3-70b-instruct",
            max_tokens=1500,
            messages=[{"role": "user", "content": TAILORING_PROMPT.format(
                resume_markdown=resume_markdown[:4000],
                full_name=profile.get("full_name", ""),
                email=profile.get("email", ""),
                skills=", ".join(profile.get("skills", [])),
                target_roles=", ".join(profile.get("target_roles", [])),
                title=job.get("title", ""),
                company=job.get("company", ""),
                description=(job.get("description_snippet") or "")[:2000],
            )}],
        )

        raw = msg.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        tailored = json.loads(raw)

        docx_bytes = _build_docx(tailored, profile.get("full_name", "Candidate"))

        docx_b64 = (
            "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,"
            + base64.b64encode(docx_bytes).decode()
        )

        row = {
            "match_id": match_id,
            "pdf_url": docx_b64,
            "keywords_injected": tailored.get("keywords_injected", []),
            "tailored_markdown": json.dumps(tailored),
        }
        result = db.table("resumes").insert(row).execute()
        resume_id = result.data[0]["id"] if result.data else None

        db.table("matches").update({"resume_ready": True}).eq("id", match_id).execute()

        download_url = (
            f"https://jobreach-api.azurewebsites.net/api/v1/resumes/{resume_id}/download"
            if resume_id else None
        )

        return {
            "pdf_url": download_url,
            "resume_id": resume_id,
            "keywords_injected": tailored.get("keywords_injected", []),
        }

    except Exception as exc:
        log.error("resume_generation_failed", match_id=match_id, error=str(exc))
        raise
