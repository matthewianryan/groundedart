from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import CuratorRankCache
from groundedart_api.domain.gating import RANK_TIERS
from groundedart_api.domain.rank_events import DEFAULT_RANK_VERSION
from groundedart_api.domain.rank_materialization import compute_rank_totals_from_events


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


def _next_unlock_for_rank(rank: int) -> NextUnlock | None:
    for tier in RANK_TIERS:
        if tier.min_rank > rank:
            unlocks = [
                (
                    "Check-in challenges per node / 5 min: "
                    f"{tier.checkin_challenges_per_node_per_5_min}"
                ),
                f"Captures per node / 24h: {tier.captures_per_node_per_24h}",
            ]
            summary = f"Unlocks {tier.name} tier limits."
            return NextUnlock(
                min_rank=tier.min_rank,
                summary=summary,
                unlocks=unlocks,
            )
    return None


async def compute_rank_projection(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    rank_version: str = DEFAULT_RANK_VERSION,
) -> RankProjection:
    cache = await db.get(CuratorRankCache, user_id)
    if cache is not None and cache.rank_version == rank_version:
        breakdown = RankBreakdown(
            points_total=cache.points_total,
            verified_captures_total=cache.verified_captures_total,
            verified_captures_counted=cache.verified_captures_counted,
            caps_applied=RankBreakdownCaps(
                per_node_per_day=cache.per_node_per_day_removed,
                per_day_total=cache.per_day_removed,
            ),
        )
    else:
        totals = await compute_rank_totals_from_events(db=db, user_id=user_id, rank_version=rank_version)
        breakdown = RankBreakdown(
            points_total=totals["points_total"],
            verified_captures_total=totals["verified_captures_total"],
            verified_captures_counted=totals["verified_captures_counted"],
            caps_applied=RankBreakdownCaps(
                per_node_per_day=totals["per_node_per_day_removed"],
                per_day_total=totals["per_day_removed"],
            ),
        )
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
    cache = await db.get(CuratorRankCache, user_id)
    if cache is not None and cache.rank_version == rank_version:
        return cache.points_total
    totals = await compute_rank_totals_from_events(db=db, user_id=user_id, rank_version=rank_version)
    return totals["points_total"]
