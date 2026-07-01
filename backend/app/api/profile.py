from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from pydantic import BaseModel
from openai import OpenAI
from app.config import get_settings
from app.database import get_db, get_supabase
from app.models.schemas import ProfileCreate, ProfileOut
from app.security import get_current_user_id, require_owned_profile
import io
import asyncio

router = APIRouter()


def _extract_user_id(authorization: str | None) -> str | None:
    """Best-effort: extract Supabase user_id from Bearer JWT. Never raises."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        sb = get_supabase()
        user = sb.auth.get_user(token)
        return user.user.id if user and user.user else None
    except Exception:
        return None

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
        timeout=4.0,
    )
    resp = client.chat.completions.create(
        model="meta/llama-3.1-8b-instruct",
        max_tokens=1000,
        temperature=0.1,
        messages=[{"role": "user", "content": _FORMAT_PROMPT.format(raw=raw[:4000])}],
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
async def parse_resume(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
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
            timeout=4.5,
        )
    except Exception:
        text = raw.strip()

    return {"text": text, "filename": filename}


@router.get("/me", response_model=ProfileOut)
async def get_my_profile(
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Return the profile for the authenticated user (looks up by user_id in JWT)."""
    result = (
        db.table("profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "No profile found for this user")
    return result.data[0]


@router.post("/", response_model=ProfileOut, status_code=201)
async def create_profile(
    payload: ProfileCreate,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    row = payload.model_dump()
    # Always bind the profile to the authenticated user (hard auth required).
    row["user_id"] = user_id
    result = db.table("profiles").insert(row).execute()
    return result.data[0]


@router.get("/{profile_id}", response_model=ProfileOut)
async def get_profile(
    profile_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    return require_owned_profile(db, profile_id, user_id)


@router.put("/{profile_id}", response_model=ProfileOut)
async def update_profile(
    profile_id: str,
    payload: ProfileCreate,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    require_owned_profile(db, profile_id, user_id)  # 401 if unauth, 404 if not owned
    result = (
        db.table("profiles")
        .update(payload.model_dump())
        .eq("id", profile_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Profile not found")
    return result.data[0]
