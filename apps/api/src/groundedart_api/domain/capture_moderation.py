from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import Capture
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.capture_state_events import apply_capture_transition_with_audit
from groundedart_api.domain.errors import AppError


async def transition_capture_state(
    *,
    db: AsyncSession,
    capture_id: uuid.UUID,
    target_state: CaptureState,
    reason_code: str | None,
    actor_type: str,
    actor_user_id: uuid.UUID | None,
    details: dict[str, object] | None = None,
) -> Capture:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)

    apply_capture_transition_with_audit(
        db=db,
        capture=capture,
        target_state=target_state,
        reason_code=reason_code,
        actor_type=actor_type,
        actor_user_id=actor_user_id,
        details=details,
    )
    await db.commit()
    await db.refresh(capture)
    return capture
