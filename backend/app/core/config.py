"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SmartChef Agent"
    app_env: str = "development"
    frontend_origin: str = "http://localhost:5173"

    # External APIs (optional at P0 — required for later phases)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
