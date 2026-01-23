from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import Capture
from groundedart_api.domain.attribution_rights import missing_public_requirements
from groundedart_api.domain.capture_events import (
    apply_capture_transition_with_audit,
    record_capture_published_event,
)
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.errors import AppError
from groundedart_api.domain.rank_events import CAPTURE_VERIFIED_EVENT_TYPE, append_rank_event
from groundedart_api.domain.rank_materialization import (
    get_capture_verified_event_day,
    refresh_rank_for_user_day,
)
from groundedart_api.domain.notifications import record_capture_verified_notification
from groundedart_api.domain.verification_events import VerificationEventEmitter
from groundedart_api.observability.ops import observe_operation


async def transition_capture_state(
    *,
    db: AsyncSession,
    capture_id: uuid.UUID,
    target_state: CaptureState,
    reason_code: str | None,
    actor_type: str,
    actor_user_id: uuid.UUID | None,
    verification_events: VerificationEventEmitter,
    details: dict[str, object] | None = None,
) -> Capture:
    async with observe_operation(
        "verification_transition",
        attributes={
            "capture.id": str(capture_id),
            "capture.target_state": target_state.value,
            "capture.actor_type": actor_type,
        },
    ):
        capture = await db.get(Capture, capture_id)
        if capture is None:
            raise AppError(code="capture_not_found", message="Capture not found", status_code=404)

        from_state = capture.state
        apply_capture_transition_with_audit(
            db=db,
            capture=capture,
            target_state=target_state,
            reason_code=reason_code,
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            details=details,
        )

        days_to_refresh: set[dt.date] = set()
        if target_state == CaptureState.verified:
            missing_fields = missing_public_requirements(capture)
            published = False
            if capture.publish_requested and not missing_fields and capture.visibility != "public":
                previous_visibility = capture.visibility
                capture.visibility = "public"
                record_capture_published_event(
                    db=db,
                    capture=capture,
                    actor_type=actor_type,
                    actor_user_id=actor_user_id,
                    details={
                        "previous_visibility": previous_visibility,
                        "auto_publish": True,
                    },
                )
                published = True
            db.add(
                record_capture_verified_notification(
                    capture=capture,
                    missing_fields=missing_fields,
                    published=published,
                )
            )
            event = await append_rank_event(
                db=db,
                user_id=capture.user_id,
                event_type=CAPTURE_VERIFIED_EVENT_TYPE,
                delta=1,
                capture_id=capture.id,
                node_id=capture.node_id,
            )
            days_to_refresh.add(event.created_at.astimezone(dt.UTC).date())
        elif from_state == CaptureState.verified.value:
            day = await get_capture_verified_event_day(db=db, capture_id=capture.id)
            if day is not None:
                days_to_refresh.add(day)

        for day in sorted(days_to_refresh):
            await refresh_rank_for_user_day(db=db, user_id=capture.user_id, day=day)

        await db.commit()
        await db.refresh(capture)
        await verification_events.capture_state_changed(
            capture_id=capture.id,
            from_state=from_state,
            to_state=capture.state,
            reason_code=capture.state_reason,
        )
        return capture
