<div align="center">

# JobReach AI

### Autonomous Job Search Agent — Built for Engineers, Powered by AI

**Paste your resume. JobReach autonomously scans 600+ live job postings, scores each against your profile across 5 dimensions, and returns ranked matches with fit scores — all in under 2 minutes.**

[![Live API](https://img.shields.io/badge/Live%20API-Azure-0078D4?style=for-the-badge&logo=microsoft-azure)](https://jobreach-api.azurewebsites.net/docs)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Celery](https://img.shields.io/badge/Celery-5.x-37814A?style=for-the-badge&logo=celery)](https://docs.celeryq.dev)

</div>

---

## What Is JobReach AI?

JobReach AI is a **multi-agent job search assistant** that automates the most time-consuming part of job hunting — finding and evaluating relevant roles at scale.

Instead of spending hours on LinkedIn or Indeed manually reading descriptions, you upload your resume once. JobReach's AI agent autonomously:

1. **Searches** 600+ live job postings from Exa semantic search, ATS feeds (Greenhouse, Lever, Ashby, Wellfound), and RSS sources
2. **Filters** irrelevant listings using your target roles, locations, salary bands, and experience level
3. **Scores** every match across 5 dimensions: *Skills Fit, Salary Alignment, Location Match, Growth Potential, Culture Signal*
4. **Researches** each company — funding stage, Glassdoor rating, headcount, red flags, tech stack
5. **Grades** matches A–F and presents them ranked with a 0–10 overall score
6. **Tailors** a keyword-injected resume PDF for every top match

You go from resume to ranked shortlist in **under 2 minutes**.

---

## Live Demo

**Try the API directly — no account needed:**

> **[https://jobreach-api.azurewebsites.net/docs](https://jobreach-api.azurewebsites.net/docs)**

Swagger UI is live. You can create a profile, launch a mission, and stream real-time results interactively.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js 16 Frontend                       │
│  Landing → Auth → Dashboard → Missions → Matches → Tracker       │
└────────────────────────┬────────────────────────────────────────┘
                         │  REST + SSE (Server-Sent Events)
┌────────────────────────▼────────────────────────────────────────┐
│                     FastAPI Backend (Azure)                       │
│  /auth  /profile  /missions  /jobs  /tracker  /resumes  /health  │
└──────────┬──────────────────────────────────────────────────────┘
           │  Celery Task Dispatch (Redis Upstash)
┌──────────▼──────────────────────────────────────────────────────┐
│                    Celery Worker Pool                             │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  ┌─────────┐ │
│  │   search    │  │    score    │  │  research  │  │ resume  │ │
│  │  (queue)    │  │  (queue)    │  │  (queue)   │  │ (queue) │ │
│  │             │  │             │  │            │  │         │ │
│  │ Exa Search  │  │ NVIDIA NIM  │  │ Company    │  │ PDF Gen │ │
│  │ ATS Feeds   │  │ Llama Score │  │ Research   │  │ Resume  │ │
│  │ RSS Parsers │  │ Grade A–F   │  │ Red Flags  │  │ Tailor  │ │
│  └─────────────┘  └─────────────┘  └────────────┘  └─────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   Supabase (Postgres + Auth + Storage)            │
│  profiles · missions · mission_events · jobs · matches           │
│  applications · resumes · company_profiles                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand, React Query |
| **Backend** | FastAPI, Uvicorn, Gunicorn, Python 3.11 |
| **Task Queue** | Celery 5, Redis (Upstash TLS), Kombu |
| **Database** | Supabase (PostgreSQL + Row-Level Security + pgvector) |
| **AI / LLM** | NVIDIA NIM — Llama 3 (OpenAI-compatible) for scoring & resume tailoring |
| **Job Search** | Exa.ai semantic search + Greenhouse / Lever / Ashby / Wellfound ATS parsers |
| **Resume Parsing** | pypdf, python-docx, Jinja2 PDF templates |
| **Auth** | Supabase Auth (JWT) |
| **File Storage** | Azure Blob Storage / Supabase Storage |
| **Deployment** | Azure App Service (Linux, B2), Docker, startup.sh |

---

## Features

### For Job Seekers
- **One-click Mission Launch** — describe the role you want, the agent handles everything
- **Real-time Progress Feed** — live SSE event stream shows the agent thinking as it works
- **Dimensional Scoring** — every match is scored on Skills, Salary, Location, Growth, Culture
- **A–F Grade Badges** — quickly filter top-tier (A/B) matches from mediocre ones
- **Company Intel** — automated research: funding, valuation, headcount, glassdoor rating, red flags
- **Resume Tailoring** — auto-generated PDF resume with keywords injected for each job
- **Kanban Tracker** — manage your pipeline from Evaluated → Applied → Interview → Offer

### For the Recruiter / Technical Evaluator
- **Multi-Agent Pipeline** — 4 specialized Celery workers running in parallel queues
- **SSE Streaming** — bidirectional real-time events without WebSocket complexity
- **Vector Embeddings** — 1536-dim profile embeddings in pgvector for semantic job matching
- **Async-First Design** — FastAPI + Celery; no blocking I/O on the request path
- **Zero Downtime Restarts** — gunicorn + supervisord process management

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (interactive) |
| `POST` | `/api/v1/auth/signup` | Register user |
| `POST` | `/api/v1/auth/signin` | Login |
| `POST` | `/api/v1/profile/` | Create candidate profile |
| `POST` | `/api/v1/profile/parse-resume/` | Upload & parse PDF/DOCX resume |
| `POST` | `/api/v1/missions/` | Launch a new job search mission |
| `GET` | `/api/v1/missions/{id}/events` | Stream live mission events (SSE) |
| `GET` | `/api/v1/jobs/matches/{missionId}` | Get ranked job matches |
| `GET` | `/api/v1/jobs/matches/detail/{id}` | Get match detail + company research |
| `POST` | `/api/v1/resumes/generate` | Trigger tailored resume generation |
| `GET` | `/api/v1/resumes/{id}/download` | Download tailored resume PDF |
| `GET` | `/api/v1/tracker/` | Get application pipeline |
| `PATCH` | `/api/v1/tracker/{id}` | Update application status |
| `GET` | `/api/v1/tracker/stats/summary` | Dashboard stats |

---

## Database Schema

8 tables in Supabase PostgreSQL with Row-Level Security:

```
profiles          — resume data, skills, target roles, pgvector embedding
missions          — job search campaigns (status, counters, filters)
mission_events    — real-time agent telemetry (SSE source)
jobs              — scraped/searched job postings
matches           — scored job-profile pairings (grade, dimensions JSONB)
applications      — user's application tracking (8 lifecycle statuses)
resumes           — generated tailored resumes with PDF URLs
company_profiles  — cached company research (funding, glassdoor, red flags)
```

---

## Project Structure

```
jobreach-ai/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app factory
│   │   ├── config.py            # Pydantic settings
│   │   ├── database.py          # Supabase singleton
│   │   ├── api/                 # Route modules (auth, profile, missions, jobs, tracker, resumes)
│   │   ├── models/schemas.py    # 30+ Pydantic models
│   │   └── workers/             # Celery tasks (search, score, research, resume)
│   ├── migrations/001_initial.sql
│   ├── startup.sh               # Azure startup: celery bg + gunicorn fg
│   └── requirements.txt
└── frontend/
    ├── app/                     # Next.js App Router (auth, dashboard, missions, matches, tracker)
    ├── components/              # UI components (match cards, kanban, score rings, mission feed)
    ├── hooks/useMissionStream.ts # SSE hook for real-time events
    └── lib/                     # API client, types, formatters
```

---

## Local Development

### Backend

```bash
cd backend

# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy env and fill in values
cp .env.example .env

# 3. Start Redis (local or point to Upstash)
# 4. Run FastAPI
uvicorn app.main:app --reload --port 8000

# 5. Run Celery workers (separate terminal)
celery -A app.workers.celery_app worker --queues search,score,research,resume -c 2 --loglevel=info
```

### Frontend

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Copy env
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

# 3. Start dev server
npm run dev
```

---

## Environment Variables

### Backend `.env`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

REDIS_URL=rediss://your-upstash-url:6379?ssl_cert_reqs=none

NVIDIA_API_KEY=your-nvidia-nim-key
EXA_API_KEY=your-exa-key

SECRET_KEY=your-secret-key
ALLOWED_ORIGINS=http://localhost:3000
ENVIRONMENT=development
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Deployment

Backend is deployed on **Azure App Service (Linux, B2, Python 3.11)**.

The `startup.sh` script launches:
- Celery worker (4 queues, concurrency 2) in the background
- Gunicorn (FastAPI) on port 8000 in the foreground

```bash
# Deploy new version
az webapp deploy \
  --name jobreach-api \
  --resource-group jobreach-rg \
  --src-path jobreach-deploy.zip \
  --type zip \
  --timeout 1800
```

---

## Resume Bullet Points

Use these for your resume or LinkedIn:

> **Built JobReach AI** — an autonomous multi-agent system that scans 600+ live job postings, scores each against your profile using AI (NVIDIA NIM / Llama), and returns ranked A–F graded matches in under 2 minutes; live at [https://jobreach-api.azurewebsites.net/docs](https://jobreach-api.azurewebsites.net/docs)

> **Engineered async backend pipeline** with FastAPI + Celery + Redis (4 parallel worker queues: search, score, research, resume); integrated Exa semantic search and ATS parsers (Greenhouse, Lever, Ashby) to source and filter job listings at scale; deployed to Azure App Service with zero-downtime gunicorn + supervisord

> **Designed full-stack architecture** with Next.js 16 (App Router), real-time SSE event streaming, Supabase PostgreSQL (8 tables, RLS, pgvector embeddings), Kanban application tracker, and automated tailored resume PDF generation per job match

---

## Author

**Mukesh Kanda** — [kandasubbarao4@gmail.com](mailto:kandasubbarao4@gmail.com)

---

<div align="center">
Built with FastAPI · Celery · Next.js · Supabase · NVIDIA NIM · Exa.ai · Azure
</div>
