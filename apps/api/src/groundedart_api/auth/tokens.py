from __future__ import annotations

import hashlib
import secrets

from groundedart_api.settings import Settings


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def hash_opaque_token(token: str, settings: Settings) -> str:
    payload = (token + settings.token_hash_secret).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()

