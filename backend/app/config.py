"""Application settings loaded from environment."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Signal Score service."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://user:password@localhost:5432/sioona"
    app_name: str = "Sioona Signal Score API"
    app_version: str = "0.1.0"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()