from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import Capture, CaptureEvent
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.capture_transitions import apply_capture_state_transition


def apply_capture_transition_with_audit(
    *,
    db: AsyncSession,
    capture: Capture,
    target_state: CaptureState,
    reason_code: str | None,
    actor_type: str,
    actor_user_id: uuid.UUID | None,
    details: dict[str, object] | None = None,
) -> None:
    current_state = CaptureState(capture.state)
    validated_reason = apply_capture_state_transition(current_state, target_state, reason_code)
    db.add(
        CaptureEvent(
            capture_id=capture.id,
            event_type="state_transition",
            from_state=current_state.value,
            to_state=target_state.value,
            reason_code=validated_reason,
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            details=details,
        )
    )
    capture.state = target_state.value
    capture.state_reason = validated_reason


def record_capture_created_event(
    *,
    db: AsyncSession,
    capture: Capture,
    actor_type: str,
    actor_user_id: uuid.UUID | None,
    reason_code: str | None,
    details: dict[str, object] | None = None,
) -> None:
    db.add(
        CaptureEvent(
            capture_id=capture.id,
            event_type="capture_created",
            from_state=None,
            to_state=CaptureState.draft.value,
            reason_code=reason_code,
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            details=details,
        )
    )
