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
        # deployed_sha/deployed_at come from stamp files the Azure startup
        # script writes AFTER a successful code fetch. If the fetch fails the
        # container keeps serving the previous code — these stamps make that
        # staleness visible in one curl instead of silently lying.
        info = {"status": "ok", "version": "1.0.0"}
        try:
            import json as _json
            import os as _os
            here = _os.path.dirname(_os.path.abspath(__file__))
            sha_path = _os.path.join(here, "DEPLOY_SHA")
            time_path = _os.path.join(here, "DEPLOY_TIME")
            if _os.path.exists(sha_path):
                raw = open(sha_path, encoding="utf-8", errors="ignore").read().strip()
                try:
                    sha = str(_json.loads(raw).get("sha", ""))
                except Exception:
                    sha = raw
                info["deployed_sha"] = (sha[:8] or "unknown")
            if _os.path.exists(time_path):
                info["deployed_at"] = open(time_path, encoding="utf-8", errors="ignore").read().strip()
        except Exception:
            pass
        return info

    return app


app = create_app()
