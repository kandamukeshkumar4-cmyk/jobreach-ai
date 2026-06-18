from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from openai import OpenAI
from app.config import get_settings
from app.database import get_db
from app.models.schemas import ProfileCreate, ProfileOut
import io
import asyncio

router = APIRouter()

_MAX_UPLOAD = 5 * 1024 * 1024  # 5 MB

_FORMAT_PROMPT = """\
You are a resume formatter. Convert the raw resume text below into clean, \
well-structured Markdown.

Rules:
- Use # for the candidate name at the top
- Use ## for major sections: Summary, Experience, Projects, Skills, Certifications, Education
- Use ### for each role/project heading, with company and dates on the next line in italics
- Use - for all bullet points
- Remove ALL duplicate bullet points — keep only the first occurrence of each
- Preserve every piece of real information: contact details, companies, dates, metrics, technologies
- Do NOT invent, summarise, or omit content — only reformat and deduplicate
- Output ONLY the Markdown, no explanation or preamble

Raw resume text:
{raw}"""


def _llm_format(raw: str) -> str:
    s = get_settings()
    client = OpenAI(
        api_key=s.nvidia_api_key,
        base_url="https://integrate.api.nvidia.com/v1",
        timeout=25.0,
    )
    resp = client.chat.completions.create(
        model="meta/llama-3.1-8b-instruct",
        max_tokens=1500,
        temperature=0.1,
        messages=[{"role": "user", "content": _FORMAT_PROMPT.format(raw=raw[:5000])}],
    )
    md = resp.choices[0].message.content.strip()
    if md.startswith("```"):
        lines = md.splitlines()
        md = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
    return md.strip()


class ResumeTextOut(BaseModel):
    text: str
    filename: str


@router.post("/parse-resume/", response_model=ResumeTextOut)
async def parse_resume(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > _MAX_UPLOAD:
        raise HTTPException(413, "File too large — maximum 5 MB.")

    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    try:
        if ext == "pdf":
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            pages = [page.extract_text() or "" for page in reader.pages]
            raw = "\n\n".join(p for p in pages if p.strip())
        elif ext == "docx":
            import docx
            doc = docx.Document(io.BytesIO(content))
            raw = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        elif ext == "txt":
            raw = content.decode("utf-8", errors="replace")
        else:
            raise HTTPException(
                400,
                f"Unsupported format '.{ext}'. Upload a PDF, DOCX, or TXT file.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not parse file: {exc}") from exc

    try:
        # Run the synchronous LLM call in a thread so it doesn't block the event loop.
        # Hard cap at 50 s — fall back to raw text if the model is slow.
        text = await asyncio.wait_for(
            asyncio.to_thread(_llm_format, raw.strip()),
            timeout=30.0,
        )
    except Exception:
        text = raw.strip()

    return {"text": text, "filename": filename}


@router.post("/", response_model=ProfileOut, status_code=201)
async def create_profile(payload: ProfileCreate, db=Depends(get_db)):
    result = db.table("profiles").insert(payload.model_dump()).execute()
    return result.data[0]


@router.get("/{profile_id}", response_model=ProfileOut)
async def get_profile(profile_id: str, db=Depends(get_db)):
    result = db.table("profiles").select("*").eq("id", profile_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Profile not found")
    return result.data


@router.put("/{profile_id}", response_model=ProfileOut)
async def update_profile(profile_id: str, payload: ProfileCreate, db=Depends(get_db)):
    result = (
        db.table("profiles")
        .update(payload.model_dump())
        .eq("id", profile_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Profile not found")
    return result.data[0]
