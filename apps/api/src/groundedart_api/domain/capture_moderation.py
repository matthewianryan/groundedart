from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import Capture
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.capture_events import apply_capture_transition_with_audit
from groundedart_api.domain.errors import AppError
from groundedart_api.domain.rank_events import CAPTURE_VERIFIED_EVENT_TYPE, append_rank_event
from groundedart_api.domain.verification_events import VerificationEventEmitter


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
    if target_state == CaptureState.verified:
        await append_rank_event(
            db=db,
            user_id=capture.user_id,
            event_type=CAPTURE_VERIFIED_EVENT_TYPE,
            delta=1,
            capture_id=capture.id,
            node_id=capture.node_id,
        )
    await db.commit()
    await db.refresh(capture)
    await verification_events.capture_state_changed(
        capture_id=capture.id,
        from_state=from_state,
        to_state=capture.state,
        reason_code=capture.state_reason,
    )
    return capture
