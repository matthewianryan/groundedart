from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from groundedart_api.api.schemas import (
    AdminAbuseEvent,
    AdminAbuseEventsResponse,
    AdminCapture,
    AdminCaptureTransitionRequest,
    AdminCaptureTransitionResponse,
    AdminCapturesResponse,
)
from groundedart_api.auth.deps import require_admin
from groundedart_api.db.models import AbuseEvent, Capture
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.capture_moderation import transition_capture_state
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.errors import AppError
from groundedart_api.domain.verification_events import VerificationEventEmitterDep

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])

ADMIN_TARGET_STATES = {
    CaptureState.verified,
    CaptureState.rejected,
    CaptureState.hidden,
}


def capture_to_admin(capture: Capture, base_media_url: str = "/media") -> AdminCapture:
    image_url = f"{base_media_url}/{capture.image_path}" if capture.image_path else None
    return AdminCapture(
        id=capture.id,
        node_id=capture.node_id,
        user_id=capture.user_id,
        state=capture.state,
        state_reason=capture.state_reason,
        created_at=capture.created_at,
        image_url=image_url,
        attribution_artist_name=capture.attribution_artist_name,
        attribution_artwork_title=capture.attribution_artwork_title,
    )


def abuse_event_to_admin(event: AbuseEvent) -> AdminAbuseEvent:
    return AdminAbuseEvent(
        id=event.id,
        event_type=event.event_type,
        user_id=event.user_id,
        node_id=event.node_id,
        capture_id=event.capture_id,
        created_at=event.created_at,
        details=event.details,
    )


@router.get("/captures/pending", response_model=AdminCapturesResponse)
async def list_pending_captures(
    db: DbSessionDep,
    node_id: uuid.UUID | None = Query(default=None),
    created_after: dt.datetime | None = Query(default=None),
    created_before: dt.datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> AdminCapturesResponse:
    query = select(Capture).where(Capture.state == CaptureState.pending_verification.value)
    if node_id is not None:
        query = query.where(Capture.node_id == node_id)
    if created_after is not None:
        query = query.where(Capture.created_at >= created_after)
    if created_before is not None:
        query = query.where(Capture.created_at <= created_before)

    captures = (await db.scalars(query.order_by(Capture.created_at.desc()).limit(limit))).all()
    return AdminCapturesResponse(captures=[capture_to_admin(capture) for capture in captures])


@router.post("/captures/{capture_id}/transition", response_model=AdminCaptureTransitionResponse)
async def transition_capture(
    capture_id: uuid.UUID,
    body: AdminCaptureTransitionRequest,
    db: DbSessionDep,
    verification_events: VerificationEventEmitterDep,
) -> AdminCaptureTransitionResponse:
    try:
        target_state = CaptureState(body.target_state)
    except ValueError as exc:
        raise AppError(
            code="invalid_capture_state_transition",
            message="Invalid admin target state",
            status_code=400,
        ) from exc
    if target_state not in ADMIN_TARGET_STATES:
        raise AppError(
            code="invalid_capture_state_transition",
            message="Invalid admin target state",
            status_code=400,
        )

    capture = await transition_capture_state(
        db=db,
        capture_id=capture_id,
        target_state=target_state,
        reason_code=body.reason_code,
        actor_type="admin",
        actor_user_id=None,
        verification_events=verification_events,
        details=body.details,
    )
    return AdminCaptureTransitionResponse(capture=capture_to_admin(capture))


@router.get("/abuse-events", response_model=AdminAbuseEventsResponse)
async def list_abuse_events(
    db: DbSessionDep,
    user_id: uuid.UUID | None = Query(default=None),
    node_id: uuid.UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    created_after: dt.datetime | None = Query(default=None),
    created_before: dt.datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> AdminAbuseEventsResponse:
    query = select(AbuseEvent)
    if user_id is not None:
        query = query.where(AbuseEvent.user_id == user_id)
    if node_id is not None:
        query = query.where(AbuseEvent.node_id == node_id)
    if event_type is not None:
        query = query.where(AbuseEvent.event_type == event_type)
    if created_after is not None:
        query = query.where(AbuseEvent.created_at >= created_after)
    if created_before is not None:
        query = query.where(AbuseEvent.created_at <= created_before)

    events = (await db.scalars(query.order_by(AbuseEvent.created_at.desc()).limit(limit))).all()
    return AdminAbuseEventsResponse(events=[abuse_event_to_admin(event) for event in events])
