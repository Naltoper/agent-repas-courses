"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ — stable regardless of process CWD (uvicorn, tests, scripts)
BACKEND_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_ROOT / ".env"

# Populate os.environ early so google-genai / nested reads also see the key
load_dotenv(ENV_FILE, override=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    app_name: str = "SmartChef Agent"
    app_env: str = "development"
    frontend_origin: str = "http://localhost:5173"

    # External APIs
    gemini_api_key: str = ""
    # 3.x series required. flash-lite: reliable on free-tier quotas for agent loops.
    gemini_model: str = "gemini-3.5-flash-lite"
    # Comma-separated fallback chain used when profile.model_selection_mode == auto
    gemini_fallback_models: str = (
        "gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.1-flash-lite,gemini-3.5-flash"
    )
    youtube_api_key: str = ""
    google_keep_email: str = ""
    google_keep_master_token: str = ""

    data_dir: str = "data"
    agent_max_tool_rounds: int = 6

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.frontend_origin.split(",") if o.strip()]
        return origins or ["http://localhost:5173"]

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key.strip())

    @property
    def has_youtube(self) -> bool:
        return bool(self.youtube_api_key.strip())

    @property
    def has_keep(self) -> bool:
        return bool(
            self.google_keep_email.strip() and self.google_keep_master_token.strip()
        )

    @property
    def resolved_data_dir(self) -> Path:
        path = Path(self.data_dir)
        if not path.is_absolute():
            path = BACKEND_ROOT / path
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reload_settings() -> Settings:
    """Drop cache and re-read backend/.env (e.g. after editing secrets)."""
    get_settings.cache_clear()
    # Do not override vars already set in the process (tests set DATA_DIR, etc.)
    load_dotenv(ENV_FILE, override=False)
    return get_settings()
