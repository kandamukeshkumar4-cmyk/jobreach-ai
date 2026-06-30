from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ── Enums ────────────────────────────────────────────────────────────────────

class MissionStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"

class EventType(str, Enum):
    run = "run"
    ok = "ok"
    star = "star"
    info = "info"
    warn = "warn"
    error = "error"

class ApplicationStatus(str, Enum):
    evaluated = "evaluated"
    applied = "applied"
    responded = "responded"
    interview = "interview"
    offer = "offer"
    rejected = "rejected"
    discarded = "discarded"
    skip = "skip"

class Grade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


# ── Profile ──────────────────────────────────────────────────────────────────

class ProfileCreate(BaseModel):
    full_name: str
    email: str
    linkedin_url: Optional[str] = None
    resume_markdown: str
    target_roles: List[str] = []
    target_locations: List[str] = []
    target_salary_min: Optional[int] = None
    target_salary_currency: str = "USD"
    skills: List[str] = []
    years_experience: Optional[int] = None
    archetypes: List[str] = []

class ProfileOut(ProfileCreate):
    id: str
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ── Mission ──────────────────────────────────────────────────────────────────

class MissionCreate(BaseModel):
    title: str = "Job Search Mission"
    search_query: str
    location_filter: Optional[str] = None
    salary_min: Optional[int] = None
    salary_currency: str = "USD"
    sources: List[str] = ["exa", "greenhouse", "lever", "ashby",
                          "smartrecruiters", "workable", "remoteok", "rss"]
    profile_id: str

class MissionOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    profile_id: str
    title: str
    search_query: str
    status: MissionStatus
    total_scanned: int = 0
    total_filtered: int = 0
    total_matches: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

class MissionEventOut(BaseModel):
    id: str
    mission_id: str
    event_type: EventType
    message: str
    detail: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime


# ── Job / Match ──────────────────────────────────────────────────────────────

class JobOut(BaseModel):
    id: str
    title: str
    company: str
    location: Optional[str] = None
    url: str
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: Optional[str] = None
    description_snippet: Optional[str] = None
    source: Optional[str] = None
    posted_at: Optional[datetime] = None
    discovered_at: Optional[datetime] = None

class DimensionScore(BaseModel):
    label: str
    score: float
    grade: Grade
    evidence: Optional[str] = None

class MatchOut(BaseModel):
    id: str
    job: JobOut
    mission_id: str
    overall_score: float
    grade: Grade
    dimensions: List[DimensionScore]
    why_fit: Optional[str] = None  # nullable in DB; one null row must not 500 the whole board
    why_gap: Optional[str] = None
    company_research: Optional[Dict[str, Any]] = None
    resume_ready: bool = False
    created_at: datetime


# ── Application tracker ──────────────────────────────────────────────────────

class ApplicationCreate(BaseModel):
    match_id: str
    notes: Optional[str] = None

class ApplicationUpdate(BaseModel):
    status: Optional[ApplicationStatus] = None
    notes: Optional[str] = None
    applied_at: Optional[datetime] = None
    next_action: Optional[str] = None
    next_action_date: Optional[datetime] = None

class ApplicationOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    match_id: str
    job_title: str
    company: str
    status: ApplicationStatus
    overall_score: float
    grade: Grade
    resume_pdf_url: Optional[str] = None
    cover_letter_pdf_url: Optional[str] = None
    notes: Optional[str] = None
    applied_at: Optional[datetime] = None
    next_action: Optional[str] = None
    next_action_date: Optional[datetime] = None
    created_at: datetime


# ── Resume generation ────────────────────────────────────────────────────────

class ResumeGenRequest(BaseModel):
    match_id: str
    include_cover_letter: bool = False
    tone: str = "direct"

class ResumeGenOut(BaseModel):
    id: str
    match_id: str
    pdf_url: str
    cover_letter_pdf_url: Optional[str] = None
    keywords_injected: List[str] = []
    created_at: datetime


# ── Generic responses ────────────────────────────────────────────────────────

class HealthOut(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"

class PaginatedOut(BaseModel):
    items: List[Any]
    total: int
    page: int
    per_page: int
