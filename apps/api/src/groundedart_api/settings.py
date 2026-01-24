from __future__ import annotations

from pathlib import Path
import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AnyHttpUrl, Field, field_validator, model_validator
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
        # pydantic-settings attempts JSON-decoding for complex env types (e.g. list fields).
        # That makes simple values like `API_CORS_ORIGINS=http://localhost:5173` fail at load
        # time (before our validators run), which prevents the API from starting.
        #
        # Disable auto-decoding and handle both JSON-array and comma-delimited formats in
        # our validators instead.
        enable_decoding=False,
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://groundedart:groundedart@localhost:5432/groundedart"
    api_cors_origins: list[AnyHttpUrl] = ["http://localhost:5173"]

    token_hash_secret: str = "dev-only-change-me"
    session_cookie_name: str = "ga_session"
    session_ttl_seconds: int = 60 * 60 * 24 * 30
    session_cookie_secure: bool = Field(
        default=False,
        description="Whether the session cookie should be marked Secure (required for SameSite=None).",
    )
    session_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax",
        description="SameSite attribute for the session cookie.",
    )
    session_cookie_domain: str | None = Field(
        default=None,
        description="Optional Domain attribute for the session cookie.",
    )
    admin_api_token: str = "dev-admin-token-change-me"

    checkin_challenge_ttl_seconds: int = Field(
        default=120, description="Time-to-live for check-in challenges, in seconds."
    )
    checkin_token_ttl_seconds: int = Field(
        default=10 * 60, description="Time-to-live for check-in tokens, in seconds."
    )
    max_location_accuracy_m: int = Field(
        default=50, description="Maximum allowed reported location accuracy, in meters."
    )
    checkin_challenge_rate_window_seconds: int = Field(
        default=5 * 60,
        description="Rolling window for check-in challenge rate limits, in seconds.",
    )
    max_checkin_challenges_per_user_node_per_window: int = Field(
        default=5,
        description="Maximum check-in challenges per user per node per rate window.",
    )
    disable_checkin_challenge_rate_limits: bool = Field(
        default=False,
        description="Disable per-user per-node check-in challenge rate limits (demo-only).",
    )
    capture_rate_window_seconds: int = Field(
        default=24 * 60 * 60,
        description="Rolling window for capture rate limits, in seconds.",
    )
    max_captures_per_user_node_per_day: int = Field(
        default=5,
        description="Maximum captures per user per node per rate window.",
    )
    disable_capture_rate_limits: bool = Field(
        default=False,
        description="Disable per-user per-node capture rate limits (demo-only).",
    )
    max_pending_verification_captures_per_node: int = Field(
        default=50,
        description="Maximum pending verification captures per node.",
    )
    report_rate_window_seconds: int = Field(
        default=10 * 60,
        description="Rolling window for report rate limits, in seconds.",
    )
    max_reports_per_user_per_window: int = Field(
        default=5,
        description="Maximum reports per user per rate window.",
    )
    tip_intent_ttl_seconds: int = Field(
        default=60 * 60,
        description="Time-to-live for tip intents, in seconds.",
    )
    tip_receipt_reconciliation_interval_seconds: int = Field(
        default=60,
        description="Minimum interval between tip receipt reconciliation checks, in seconds.",
    )
    tip_receipt_reconciliation_cutoff_seconds: int = Field(
        default=60 * 60,
        description="Cutoff window before marking missing tip receipts as failed, in seconds.",
    )
    solana_rpc_url: AnyHttpUrl = Field(
        default="https://api.devnet.solana.com",
        description="Solana JSON-RPC endpoint for tip receipt verification.",
    )

    verification_events_mode: Literal["noop", "log", "webhook"] = Field(
        default="log",
        description="How to emit capture verification boundary events.",
    )
    verification_events_webhook_url: AnyHttpUrl | None = Field(
        default=None,
        description="Destination URL for webhook verification events when mode=webhook.",
    )
    verification_events_webhook_token: str | None = Field(
        default=None,
        description="Optional shared secret included as X-GroundedArt-Webhook-Token when mode=webhook.",
    )
    verification_events_webhook_timeout_seconds: float = Field(
        default=5.0,
        description="Timeout for webhook emission, in seconds.",
    )

    media_dir: str = "./.local_media"
    media_serve_static: bool = Field(
        default=True,
        description="Whether the API should mount /media as unauthenticated static file serving (dev-only).",
    )
    media_public_base_url: str = Field(
        default="/media",
        description="Base URL used when constructing image_url fields (e.g. /media or https://cdn.example.com/media).",
    )
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
            raw = value.strip()
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    values = [str(item).strip() for item in parsed]
                else:
                    values = [item.strip() for item in raw.split(",")]
            else:
                values = [item.strip() for item in raw.split(",")]
        else:
            values = [str(item).strip() for item in value]
        return [item.lower() for item in values if item]

    @model_validator(mode="after")
    def _validate_settings(self) -> "Settings":
        if self.verification_events_mode == "webhook" and not self.verification_events_webhook_url:
            raise ValueError(
                "VERIFICATION_EVENTS_WEBHOOK_URL is required when VERIFICATION_EVENTS_MODE=webhook"
            )
        if self.session_cookie_samesite == "none" and not self.session_cookie_secure:
            raise ValueError("SESSION_COOKIE_SECURE=true is required when SESSION_COOKIE_SAMESITE=none")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


SettingsDep = Annotated[Settings, None]
