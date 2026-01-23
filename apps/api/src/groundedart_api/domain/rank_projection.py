from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import Capture, CuratorRankEvent
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.rank_events import DEFAULT_RANK_VERSION

CAPTURE_VERIFIED_EVENT_TYPE = "capture_verified"
PER_NODE_PER_DAY_CAP = 1
PER_DAY_POINTS_CAP = 3


@dataclass(frozen=True)
class RankBreakdownCaps:
    per_node_per_day: int
    per_day_total: int


@dataclass(frozen=True)
class RankBreakdown:
    points_total: int
    verified_captures_total: int
    verified_captures_counted: int
    caps_applied: RankBreakdownCaps


@dataclass(frozen=True)
class NextUnlock:
    min_rank: int
    summary: str
    unlocks: list[str]


@dataclass(frozen=True)
class RankProjection:
    rank: int
    rank_version: str
    breakdown: RankBreakdown
    next_unlock: NextUnlock | None


@dataclass(frozen=True)
class _RankEventRow:
    event_id: uuid.UUID
    capture_id: uuid.UUID | None
    node_id: uuid.UUID | None
    created_at: dt.datetime
    delta: int


_RANK_TIERS = [
    {
        "name": "New",
        "min_rank": 0,
        "checkin_challenges_per_node_per_5_min": 3,
        "captures_per_node_per_24h": 1,
    },
    {
        "name": "Apprentice",
        "min_rank": 1,
        "checkin_challenges_per_node_per_5_min": 5,
        "captures_per_node_per_24h": 2,
    },
    {
        "name": "Contributor",
        "min_rank": 3,
        "checkin_challenges_per_node_per_5_min": 8,
        "captures_per_node_per_24h": 4,
    },
    {
        "name": "Trusted",
        "min_rank": 6,
        "checkin_challenges_per_node_per_5_min": 12,
        "captures_per_node_per_24h": 6,
    },
]


def _utc_date(value: dt.datetime) -> dt.date:
    if value.tzinfo is None:
        return value.date()
    return value.astimezone(dt.timezone.utc).date()


def _next_unlock_for_rank(rank: int) -> NextUnlock | None:
    for tier in _RANK_TIERS:
        if tier["min_rank"] > rank:
            unlocks = [
                (
                    "Check-in challenges per node / 5 min: "
                    f"{tier['checkin_challenges_per_node_per_5_min']}"
                ),
                f"Captures per node / 24h: {tier['captures_per_node_per_24h']}",
            ]
            summary = f"Unlocks {tier['name']} tier limits."
            return NextUnlock(
                min_rank=tier["min_rank"],
                summary=summary,
                unlocks=unlocks,
            )
    return None


def _apply_rank_caps(events: list[_RankEventRow]) -> RankBreakdown:
    per_node_per_day_removed = 0
    per_day_removed = 0
    node_day_seen: set[tuple[uuid.UUID | None, dt.date]] = set()
    filtered: list[_RankEventRow] = []

    for event in events:
        key_id = event.node_id or event.capture_id or event.event_id
        key = (key_id, _utc_date(event.created_at))
        if key in node_day_seen:
            per_node_per_day_removed += 1
            continue
        node_day_seen.add(key)
        filtered.append(event)

    points_by_day: dict[dt.date, int] = {}
    counted: list[_RankEventRow] = []
    for event in filtered:
        day = _utc_date(event.created_at)
        current = points_by_day.get(day, 0)
        if current + event.delta > PER_DAY_POINTS_CAP:
            per_day_removed += 1
            continue
        points_by_day[day] = current + event.delta
        counted.append(event)

    points_total = sum(event.delta for event in counted)
    return RankBreakdown(
        points_total=points_total,
        verified_captures_total=len(events),
        verified_captures_counted=len(counted),
        caps_applied=RankBreakdownCaps(
            per_node_per_day=per_node_per_day_removed,
            per_day_total=per_day_removed,
        ),
    )


async def compute_rank_projection(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    rank_version: str = DEFAULT_RANK_VERSION,
) -> RankProjection:
    query = (
        select(
            CuratorRankEvent.id,
            CuratorRankEvent.capture_id,
            CuratorRankEvent.node_id,
            CuratorRankEvent.created_at,
            CuratorRankEvent.delta,
        )
        .join(Capture, CuratorRankEvent.capture_id == Capture.id)
        .where(
            CuratorRankEvent.user_id == user_id,
            CuratorRankEvent.rank_version == rank_version,
            CuratorRankEvent.event_type == CAPTURE_VERIFIED_EVENT_TYPE,
            Capture.state == CaptureState.verified.value,
        )
        .order_by(CuratorRankEvent.created_at.asc(), CuratorRankEvent.id.asc())
    )
    rows = (await db.execute(query)).all()
    events = [
        _RankEventRow(
            event_id=row.id,
            capture_id=row.capture_id,
            node_id=row.node_id,
            created_at=row.created_at,
            delta=row.delta,
        )
        for row in rows
    ]

    breakdown = _apply_rank_caps(events)
    return RankProjection(
        rank=breakdown.points_total,
        rank_version=rank_version,
        breakdown=breakdown,
        next_unlock=_next_unlock_for_rank(breakdown.points_total),
    )


async def get_rank_for_user(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    rank_version: str = DEFAULT_RANK_VERSION,
) -> int:
    projection = await compute_rank_projection(
        db=db,
        user_id=user_id,
        rank_version=rank_version,
    )
    return projection.rank
