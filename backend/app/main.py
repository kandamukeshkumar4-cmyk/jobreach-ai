from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog

from app.config import get_settings
from app.api import missions, jobs, tracker, resumes, profile, auth, answers, interview, archive

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("jobreach_api_starting")
    yield
    log.info("jobreach_api_shutdown")


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="JobReach AI API",
        version="1.0.0",
        description="AI-powered job search agent backend",
        lifespan=lifespan,
    )

    origins = s.allowed_origins.split(",") if s.allowed_origins != "*" else ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(profile.router, prefix="/api/v1/profile", tags=["profile"])
    app.include_router(missions.router, prefix="/api/v1/missions", tags=["missions"])
    app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
    app.include_router(tracker.router, prefix="/api/v1/tracker", tags=["tracker"])
    app.include_router(resumes.router, prefix="/api/v1/resumes", tags=["resumes"])
    app.include_router(answers.router, prefix="/api/v1/answers", tags=["answers"])
    app.include_router(interview.router, prefix="/api/v1/interview", tags=["interview"])
    app.include_router(archive.router, prefix="/api/v1/archive", tags=["archive"])

    @app.get("/health")
    async def health():
        return {"status": "ok", "version": "1.0.0"}

    return app


app = create_app()
