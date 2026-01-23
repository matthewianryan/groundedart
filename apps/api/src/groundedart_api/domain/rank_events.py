from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import CuratorRankEvent, utcnow

DEFAULT_RANK_VERSION = "v1_points"


async def append_rank_event(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    event_type: str,
    delta: int,
    capture_id: uuid.UUID | None = None,
    node_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
    rank_version: str = DEFAULT_RANK_VERSION,
    created_at: dt.datetime | None = None,
) -> CuratorRankEvent:
    event_id = uuid.uuid4()
    created_at = created_at or utcnow()
    insert_stmt = (
        insert(CuratorRankEvent)
        .values(
            id=event_id,
            user_id=user_id,
            event_type=event_type,
            delta=delta,
            rank_version=rank_version,
            capture_id=capture_id,
            node_id=node_id,
            details=details,
            created_at=created_at,
        )
        .on_conflict_do_nothing(constraint="uq_rank_events_event_type_capture_id")
        .returning(CuratorRankEvent.id)
    )
    result = await db.execute(insert_stmt)
    inserted_id = result.scalar_one_or_none()
    if inserted_id is not None:
        event = await db.get(CuratorRankEvent, inserted_id)
        if event is not None:
            return event

    existing = await db.scalar(
        select(CuratorRankEvent).where(
            CuratorRankEvent.event_type == event_type,
            CuratorRankEvent.capture_id == capture_id,
        )
    )
    if existing is None:
        raise RuntimeError("Rank event insert failed without returning an existing event.")
    return existing


async def list_rank_events_for_user(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int | None = None,
) -> list[CuratorRankEvent]:
    query = (
        select(CuratorRankEvent)
        .where(CuratorRankEvent.user_id == user_id)
        .order_by(CuratorRankEvent.created_at.asc(), CuratorRankEvent.id.asc())
    )
    if limit is not None:
        query = query.limit(limit)
    return (await db.scalars(query)).all()
