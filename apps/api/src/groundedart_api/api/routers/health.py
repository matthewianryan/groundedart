from __future__ import annotations

from fastapi import APIRouter

from groundedart_api.api.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()

