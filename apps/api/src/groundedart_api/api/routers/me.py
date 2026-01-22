from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from groundedart_api.api.schemas import MeResponse
from groundedart_api.auth.deps import CurrentUser
from groundedart_api.db.models import CuratorProfile
from groundedart_api.db.session import DbSessionDep

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me", response_model=MeResponse)
async def me(db: DbSessionDep, user: CurrentUser) -> MeResponse:
    profile = await db.scalar(select(CuratorProfile).where(CuratorProfile.user_id == user.id))
    rank = profile.rank if profile else 0
    return MeResponse(user_id=user.id, rank=rank)

