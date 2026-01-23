from __future__ import annotations

from pathlib import Path
import json
from functools import lru_cache
from typing import Annotated

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _get_repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / ".git").exists():
            return parent
    try:
        return current.parents[4]
    except IndexError:
        return current.parent


ENV_FILE = _get_repo_root() / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        env_parse_delimiter=",",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://groundedart:groundedart@localhost:5432/groundedart"
    api_cors_origins: list[AnyHttpUrl] = ["http://localhost:5173"]

    token_hash_secret: str = "dev-only-change-me"
    session_cookie_name: str = "ga_session"
    session_ttl_seconds: int = 60 * 60 * 24 * 30

    checkin_challenge_ttl_seconds: int = Field(
        default=120, description="Time-to-live for check-in challenges, in seconds."
    )
    checkin_token_ttl_seconds: int = Field(
        default=10 * 60, description="Time-to-live for check-in tokens, in seconds."
    )
    max_location_accuracy_m: int = Field(
        default=50, description="Maximum allowed reported location accuracy, in meters."
    )

    media_dir: str = "./.local_media"
    upload_allowed_mime_types: list[str] = Field(
        default=["image/jpeg", "image/png", "image/webp"],
        description="Allowed MIME types for capture uploads.",
    )
    upload_max_bytes: int = Field(
        default=1_500_000,
        description="Maximum allowed upload size for capture images, in bytes.",
    )

    @field_validator("api_cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: list[AnyHttpUrl] | str) -> list[AnyHttpUrl] | str:
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if str(origin).strip()]
            return [origin.strip() for origin in raw.split(",") if origin.strip()]
        return value

    @field_validator("upload_allowed_mime_types", mode="before")
    @classmethod
    def _normalize_upload_mime_types(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            values = [item.strip() for item in value.split(",")]
        else:
            values = [str(item).strip() for item in value]
        return [item.lower() for item in values if item]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


SettingsDep = Annotated[Settings, None]
