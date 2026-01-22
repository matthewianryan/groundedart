from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from groundedart_api.settings import Settings, get_settings


@lru_cache(maxsize=4)
def create_sessionmaker(database_url: str) -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(database_url, pool_pre_ping=True)
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_db_session(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AsyncIterator[AsyncSession]:
    sessionmaker = create_sessionmaker(settings.database_url)
    async with sessionmaker() as session:
        yield session


DbSessionDep = Annotated[AsyncSession, Depends(get_db_session)]
