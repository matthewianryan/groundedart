from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import AbuseEvent


async def record_abuse_event(
    db: AsyncSession,
    event_type: str,
    user_id: uuid.UUID | None,
    node_id: uuid.UUID | None = None,
    capture_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    db.add(
        AbuseEvent(
            event_type=event_type,
            user_id=user_id,
            node_id=node_id,
            capture_id=capture_id,
            details=details,
        )
    )
    await db.commit()
