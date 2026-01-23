from __future__ import annotations

import datetime as dt
import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import CuratorRankEvent, utcnow

CAPTURE_VERIFIED_EVENT_TYPE = "capture_verified"

DEFAULT_RANK_VERSION = "v1_points"

RANK_EVENT_IDENTITY_VERSION = 1


def _normalize_identity_str(value: str) -> str:
    return value.strip().lower()


def _jsonable_identity_value(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value).lower()
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            raise ValueError("Rank event identity datetimes must be timezone-aware.")
        return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, dict):
        out: dict[str, object] = {}
        for key, inner in value.items():
            if inner is None:
                continue
            out[str(key)] = _jsonable_identity_value(inner)
        return out
    if isinstance(value, (list, tuple)):
        return [_jsonable_identity_value(item) for item in value]
    raise TypeError(f"Unsupported rank event identity value: {type(value).__name__}")


def compute_rank_event_deterministic_id(
    *,
    event_type: str,
    rank_version: str,
    user_id: uuid.UUID,
    source_kind: str,
    source_id: str | uuid.UUID,
    attributes: dict[str, object] | None = None,
) -> str:
    identity: dict[str, object] = {
        "v": RANK_EVENT_IDENTITY_VERSION,
        "event_type": _normalize_identity_str(event_type),
        "rank_version": _normalize_identity_str(rank_version),
        "user_id": str(user_id).lower(),
        "source_kind": _normalize_identity_str(source_kind),
        "source_id": _jsonable_identity_value(source_id),
    }
    if attributes:
        identity["attributes"] = _jsonable_identity_value(attributes)

    payload = json.dumps(identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    return hashlib.sha256(payload).hexdigest()


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
    source_kind: str | None = None,
    source_id: str | uuid.UUID | None = None,
    identity_attributes: dict[str, object] | None = None,
    created_at: dt.datetime | None = None,
) -> CuratorRankEvent:
    event_id = uuid.uuid4()
    created_at = created_at or utcnow()
    if (source_kind is None) != (source_id is None):
        raise ValueError("source_kind and source_id must be provided together.")
    if source_kind is None and capture_id is not None:
        source_kind = "capture"
        source_id = capture_id
    if source_kind is None or source_id is None:
        raise ValueError(
            "Cannot derive rank event identity: provide source_kind/source_id or capture_id."
        )

    deterministic_id = compute_rank_event_deterministic_id(
        event_type=event_type,
        rank_version=rank_version,
        user_id=user_id,
        source_kind=source_kind,
        source_id=source_id,
        attributes=identity_attributes,
    )
    insert_stmt = (
        insert(CuratorRankEvent)
        .values(
            id=event_id,
            deterministic_id=deterministic_id,
            user_id=user_id,
            event_type=event_type,
            delta=delta,
            rank_version=rank_version,
            capture_id=capture_id,
            node_id=node_id,
            details=details,
            created_at=created_at,
        )
        .on_conflict_do_nothing(constraint="uq_rank_events_deterministic_id")
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
            CuratorRankEvent.deterministic_id == deterministic_id,
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
