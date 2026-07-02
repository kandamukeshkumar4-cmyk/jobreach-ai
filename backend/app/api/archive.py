"""Posting archiver — snapshot a job posting before it disappears (career-ops port).

Mounted at /api/v1/archive.
"""
import html
import ipaddress
import re
import socket
from urllib.parse import urlparse

import requests
import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.database import get_db
from app.security import get_current_user_id

log = structlog.get_logger()

router = APIRouter()

# Browser-ish UA — some ATS/job hosts 403 the default python-requests UA
# (same rationale as app.workers.search._UA).
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

_HTML_CAP = 500_000
_TEXT_CAP = 100_000


class ArchiveCreate(BaseModel):
    application_id: str


def _require_owned_application(db, application_id: str, user_id: str) -> dict:
    try:
        app_row = db.table("applications").select("*").eq("id", application_id).single().execute().data
    except Exception:
        app_row = None
    if not app_row or app_row.get("user_id") != user_id:
        raise HTTPException(404, "Application not found")
    return app_row


def _is_safe_url(url: str) -> bool:
    """SSRF guard for the server-side snapshot fetch: http(s) only, and the
    host must not resolve to a private/loopback/link-local/reserved address
    (jobs.url comes from feed ingestion, but a poisoned feed must not be able
    to point this fetch at instance metadata or internal services)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        for info in socket.getaddrinfo(parsed.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        return True
    except Exception:
        return False


def _extract_title(page_html: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", page_html, re.I | re.S)
    if not m:
        return ""
    return html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()


def _extract_text(page_html: str) -> str:
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", page_html, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


@router.post("/", status_code=201)
async def archive_posting(
    payload: ArchiveCreate,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Fetch and store a snapshot of the application's job posting."""
    app_row = _require_owned_application(db, payload.application_id, user_id)

    url = None
    try:
        match = (
            db.table("matches")
            .select("job_id, jobs(url)")
            .eq("id", app_row.get("match_id"))
            .single()
            .execute()
            .data
        )
        url = ((match or {}).get("jobs") or {}).get("url")
    except Exception:
        url = None
    if not url:
        raise HTTPException(404, "No posting URL")
    if not _is_safe_url(url):
        raise HTTPException(422, "Posting is unreachable (it may already be taken down).")

    try:
        resp = requests.get(url, headers={"User-Agent": _UA}, timeout=8, allow_redirects=True)
    except Exception as e:
        log.warning("archive_fetch_failed", application_id=payload.application_id, error=str(e))
        raise HTTPException(422, "Posting is unreachable (it may already be taken down).")
    if resp.status_code != 200:
        raise HTTPException(422, "Posting is unreachable (it may already be taken down).")

    page_html = resp.text or ""
    title = _extract_title(page_html)
    content_text = _extract_text(page_html)[:_TEXT_CAP]
    content_html = page_html[:_HTML_CAP]

    row = {
        "user_id": user_id,
        "application_id": payload.application_id,
        "url": url,
        "title": title,
        "company": app_row.get("company"),
        "content_text": content_text,
        "content_html": content_html,
    }
    saved = db.table("posting_archives").insert(row).execute().data[0]
    log.info("posting_archived", archive_id=saved["id"],
             application_id=payload.application_id, chars=len(content_text))
    return {
        "id": saved["id"],
        "application_id": saved["application_id"],
        "url": saved["url"],
        "title": saved["title"],
        "archived_at": saved["archived_at"],
        "chars": len(content_text),
    }


@router.get("/{application_id}")
async def get_archive(
    application_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Newest archive for an application — metadata only."""
    _require_owned_application(db, application_id, user_id)
    result = (
        db.table("posting_archives")
        .select("id, url, title, company, archived_at, content_text")
        .eq("application_id", application_id)
        .eq("user_id", user_id)
        .order("archived_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "No archive for this application")
    row = result.data[0]
    return {
        "id": row["id"],
        "url": row["url"],
        "title": row["title"],
        "company": row["company"],
        "archived_at": row["archived_at"],
        "chars": len(row.get("content_text") or ""),
    }


@router.get("/item/{archive_id}/download")
async def download_archive(
    archive_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Serve the stored snapshot as a text/html attachment."""
    try:
        row = db.table("posting_archives").select("*").eq("id", archive_id).single().execute().data
    except Exception:
        row = None
    if not row or row.get("user_id") != user_id:
        raise HTTPException(404, "Archive not found")

    archived_at = str(row.get("archived_at") or "")[:10]
    banner = (
        '<div style="padding:8px 12px;background:#f5f5f5;border-bottom:1px solid #ddd;'
        'font:13px sans-serif;color:#333">'
        f"Archived {html.escape(archived_at)} from {html.escape(row.get('url') or '')} by JobReach"
        "</div>\n"
    )
    content_html = row.get("content_html") or ""
    if content_html:
        body = banner + content_html
    else:
        body = banner + "<pre>" + html.escape(row.get("content_text") or "") + "</pre>"

    return Response(
        content=body,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="Posting_{archive_id[:8]}.html"'},
    )
