from __future__ import annotations

from pathlib import Path
from functools import lru_cache
from typing import Annotated

from pydantic import AnyHttpUrl
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

    checkin_challenge_ttl_seconds: int = 120
    checkin_token_ttl_seconds: int = 10 * 60
    max_location_accuracy_m: int = 50

    media_dir: str = "./.local_media"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


SettingsDep = Annotated[Settings, None]
