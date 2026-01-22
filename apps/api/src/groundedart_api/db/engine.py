from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from groundedart_api.settings import Settings


def create_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(settings.database_url, pool_pre_ping=True)

