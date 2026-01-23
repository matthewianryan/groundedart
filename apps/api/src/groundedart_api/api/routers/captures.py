from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy import func, select

from groundedart_api.api.schemas import CapturePublic, CreateCaptureRequest, CreateCaptureResponse
from groundedart_api.auth.deps import CurrentUser
from groundedart_api.auth.tokens import hash_opaque_token
from groundedart_api.db.models import Capture, CheckinToken
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.capture_state_events import apply_capture_transition_with_audit
from groundedart_api.domain.capture_transitions import validate_capture_state_reason
from groundedart_api.domain.errors import AppError
from groundedart_api.domain.verification_events import VerificationEventEmitterDep
from groundedart_api.settings import Settings, get_settings
from groundedart_api.storage.deps import MediaStorageDep
from groundedart_api.time import UtcNow, get_utcnow

router = APIRouter(prefix="/v1", tags=["captures"])


def capture_to_public(capture: Capture, base_media_url: str = "/media") -> CapturePublic:
    image_url = f"{base_media_url}/{capture.image_path}" if capture.image_path else None
    return CapturePublic(
        id=capture.id,
        node_id=capture.node_id,
        state=capture.state,
        created_at=capture.created_at,
        image_url=image_url,
    )


@router.post("/captures", response_model=CreateCaptureResponse)
async def create_capture(
    body: CreateCaptureRequest,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
    now: UtcNow = Depends(get_utcnow),
) -> CreateCaptureResponse:
    now_time = now()
    token_hash = hash_opaque_token(body.checkin_token, settings)
    token = await db.scalar(
        select(CheckinToken).where(
            CheckinToken.token_hash == token_hash,
            CheckinToken.used_at.is_(None),
        )
    )
    if token is None or token.user_id != user.id or token.node_id != body.node_id:
        raise AppError(
            code="invalid_checkin_token",
            message="Invalid check-in token",
            status_code=400,
        )
    if now_time >= token.expires_at:
        raise AppError(
            code="checkin_token_expired",
            message="Check-in token expired",
            status_code=400,
        )

    window_start = now_time - dt.timedelta(seconds=settings.capture_rate_window_seconds)
    recent_captures = await db.scalar(
        select(func.count())
        .select_from(Capture)
        .where(
            Capture.user_id == user.id,
            Capture.node_id == body.node_id,
            Capture.created_at >= window_start,
        )
    )
    if (recent_captures or 0) >= settings.max_captures_per_user_node_per_day:
        raise AppError(
            code="capture_rate_limited",
            message="Capture rate limit exceeded",
            status_code=429,
            details={
                "max_per_window": settings.max_captures_per_user_node_per_day,
                "window_seconds": settings.capture_rate_window_seconds,
            },
        )

    token.used_at = now_time
    capture = Capture(
        user_id=user.id,
        node_id=body.node_id,
        attribution_artist_name=body.attribution_artist_name,
        attribution_artwork_title=body.attribution_artwork_title,
        state=CaptureState.draft.value,
        state_reason=validate_capture_state_reason(CaptureState.draft, "geo_passed"),
    )
    db.add(capture)
    await db.commit()
    await db.refresh(capture)
    return CreateCaptureResponse(capture=capture_to_public(capture))


@router.get("/captures/{capture_id}", response_model=CapturePublic)
async def get_capture(
    capture_id: uuid.UUID,
    db: DbSessionDep,
    user: CurrentUser,
) -> CapturePublic:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)
    if capture.user_id != user.id:
        raise AppError(code="forbidden", message="Forbidden", status_code=403)
    return capture_to_public(capture)


@router.post("/captures/{capture_id}/image", response_model=CapturePublic)
async def upload_capture_image(
    capture_id: uuid.UUID,
    file: UploadFile,
    db: DbSessionDep,
    user: CurrentUser,
    storage: MediaStorageDep,
    verification_events: VerificationEventEmitterDep,
    settings: Settings = Depends(get_settings),
) -> CapturePublic:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)
    if capture.user_id != user.id:
        raise AppError(code="forbidden", message="Forbidden", status_code=403)

    if capture.state == CaptureState.draft.value:
        pending_count = await db.scalar(
            select(func.count())
            .select_from(Capture)
            .where(
                Capture.node_id == capture.node_id,
                Capture.state == CaptureState.pending_verification.value,
            )
        )
        if (pending_count or 0) >= settings.max_pending_verification_captures_per_node:
            raise AppError(
                code="pending_verification_cap_reached",
                message="Pending verification cap reached",
                status_code=429,
                details={
                    "max_pending_per_node": settings.max_pending_verification_captures_per_node,
                },
            )

    stored = await storage.save_capture_image(capture_id=capture.id, upload=file)
    capture.image_path = stored.path
    capture.image_mime = stored.mime
    promoted = False
    if capture.state == CaptureState.draft.value:
        apply_capture_transition_with_audit(
            db=db,
            capture=capture,
            target_state=CaptureState.pending_verification,
            reason_code="image_uploaded",
            actor_type="user",
            actor_user_id=user.id,
        )
        promoted = True
    await db.commit()
    await db.refresh(capture)
    if promoted:
        await verification_events.capture_uploaded(
            capture_id=capture.id,
            node_id=capture.node_id,
            user_id=capture.user_id,
        )
    return capture_to_public(capture)
