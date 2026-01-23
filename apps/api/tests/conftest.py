from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from groundedart_api.db.session import create_sessionmaker
from groundedart_api.main import create_app
from groundedart_api.settings import get_settings


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def alembic_config() -> Config:
    config_dir = Path(__file__).resolve().parents[1]
    cfg = Config(str(config_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(config_dir / "src/groundedart_api/db/migrations"))
    cfg.set_main_option("prepend_sys_path", str(config_dir / "src"))
    return cfg


@pytest.fixture(scope="session", autouse=True)
def migrate_db(alembic_config: Config) -> None:
    settings = get_settings()
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    command.upgrade(alembic_config, "head")


@pytest.fixture
def db_sessionmaker():
    settings = get_settings()
    create_sessionmaker.cache_clear()
    return create_sessionmaker(settings.database_url)


@pytest.fixture(autouse=True)
def media_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_DIR", str(tmp_path))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
async def reset_db(db_sessionmaker):
    async with db_sessionmaker() as session:
        await session.execute(
            text(
                "TRUNCATE captures, checkin_tokens, checkin_challenges, nodes, "
                "devices, sessions, curator_profiles, users RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()
    yield


@pytest.fixture
async def client(media_dir):
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
