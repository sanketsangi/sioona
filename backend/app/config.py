"""Application settings loaded from environment."""

from functools import lru_cache
from pathlib import Path

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always resolve .env relative to the backend/ package root (not process cwd).
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    """Runtime configuration for the Signal Score service."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://user:password@localhost:5432/sioona"
    app_name: str = "Sioona Signal Score API"
    app_version: str = "0.1.0"
    sioona_env: str = "development"
    sioona_service_token: str = ""
    sioona_global_control_tenant: str = ""
    sioona_detection_execution: Literal["inline", "worker"] = "inline"
    sioona_worker_pause: bool = False
    sioona_actor_key: str = ""
    sioona_actor_auth_mode: Literal["off", "shadow", "enforce"] = Field(
        default="off",
        validation_alias="SIOONA_ACTOR_AUTH",
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()


def backend_root() -> Path:
    """Return the backend package root directory."""
    return _BACKEND_ROOT
