from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import Capture, CaptureStateEvent
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
        CaptureStateEvent(
            capture_id=capture.id,
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
