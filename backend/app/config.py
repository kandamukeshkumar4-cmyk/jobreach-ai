from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "JobReach AI API"
    environment: str = "production"
    debug: bool = False
    secret_key: str = "change-me-in-production"
    allowed_origins: str = "*"

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str

    # Redis (Upstash or Azure Cache)
    redis_url: str = "redis://localhost:6379/0"

    # NVIDIA NIM (OpenAI-compatible)
    nvidia_api_key: str

    # Exa search
    exa_api_key: str = ""

    # Azure Storage (for PDFs)
    azure_storage_connection_string: str = ""
    azure_storage_container: str = "resumes"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
