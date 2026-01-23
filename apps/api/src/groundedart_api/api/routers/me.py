from __future__ import annotations

from fastapi import APIRouter
from groundedart_api.api.schemas import MeResponse, NextUnlock, RankBreakdown, RankBreakdownCaps
from groundedart_api.auth.deps import CurrentUser
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.rank_projection import compute_rank_projection

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me", response_model=MeResponse)
async def me(db: DbSessionDep, user: CurrentUser) -> MeResponse:
    projection = await compute_rank_projection(db=db, user_id=user.id)
    breakdown = RankBreakdown(
        points_total=projection.breakdown.points_total,
        verified_captures_total=projection.breakdown.verified_captures_total,
        verified_captures_counted=projection.breakdown.verified_captures_counted,
        caps_applied=RankBreakdownCaps(
            per_node_per_day=projection.breakdown.caps_applied.per_node_per_day,
            per_day_total=projection.breakdown.caps_applied.per_day_total,
        ),
    )
    next_unlock = None
    if projection.next_unlock is not None:
        next_unlock = NextUnlock(
            min_rank=projection.next_unlock.min_rank,
            summary=projection.next_unlock.summary,
            unlocks=projection.next_unlock.unlocks,
        )
    return MeResponse(
        user_id=user.id,
        rank=projection.rank,
        rank_version=projection.rank_version,
        rank_breakdown=breakdown,
        next_unlock=next_unlock,
    )
