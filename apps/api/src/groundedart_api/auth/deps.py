from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select

from groundedart_api.auth.tokens import hash_opaque_token
from groundedart_api.db.models import Session, User
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.errors import AppError
from groundedart_api.settings import Settings, get_settings
from groundedart_api.time import UtcNow, get_utcnow


async def get_optional_user(
    db: DbSessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
    now: Annotated[UtcNow, Depends(get_utcnow)],
    request: Request,
) -> User | None:
    session_cookie = request.cookies.get(settings.session_cookie_name)
    if not session_cookie:
        return None

    token_hash = hash_opaque_token(session_cookie, settings)
    session = await db.scalar(
        select(Session).where(
            Session.token_hash == token_hash,
            Session.revoked_at.is_(None),
        )
    )
    if not session or now() >= session.expires_at:
        return None
    return await db.get(User, session.user_id)


async def require_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise AppError(code="auth_required", message="Authentication required", status_code=401)
    return user


CurrentUser = Annotated[User, Depends(require_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
