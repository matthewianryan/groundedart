from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select

from groundedart_api.api.schemas import AnonymousSessionRequest, AnonymousSessionResponse
from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import CuratorProfile, Device, Session, User, utcnow
from groundedart_api.db.session import DbSessionDep
from groundedart_api.settings import Settings, get_settings

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


@router.post("/anonymous", response_model=AnonymousSessionResponse)
async def create_anonymous_session(
    body: AnonymousSessionRequest,
    response: Response,
    db: DbSessionDep,
    settings: Settings = Depends(get_settings),
) -> AnonymousSessionResponse:
    device_id = str(body.device_id)
    device = await db.scalar(select(Device).where(Device.device_id == device_id))

    if device is None:
        user = User()
        db.add(user)
        await db.flush()
        db.add(Device(device_id=device_id, user_id=user.id))
        db.add(CuratorProfile(user_id=user.id, rank=0))
    else:
        user = await db.get(User, device.user_id)
        device.last_seen_at = utcnow()

    token = generate_opaque_token()
    token_hash = hash_opaque_token(token, settings)
    expires_at = utcnow() + dt.timedelta(seconds=settings.session_ttl_seconds)
    db.add(Session(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    await db.commit()

    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.session_ttl_seconds,
        path="/",
    )

    return AnonymousSessionResponse(user_id=user.id, session_expires_at=expires_at)

