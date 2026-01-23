from __future__ import annotations

import asyncio
import os
from pathlib import Path

import psycopg
import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from psycopg import sql
from sqlalchemy import text
from sqlalchemy.engine import make_url

from groundedart_api.db.session import create_sessionmaker
from groundedart_api.main import create_app
from groundedart_api.settings import get_settings


def _normalize_psycopg_dsn(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("postgresql+psycopg://"):
        return url.replace("postgresql+psycopg://", "postgresql://", 1)
    return url


def _get_test_database_url() -> str:
    explicit = os.environ.get("DATABASE_URL_TEST") or os.environ.get("TEST_DATABASE_URL")
    if explicit:
        return explicit
    base_url = get_settings().database_url
    url = make_url(base_url)
    if not url.database:
        raise RuntimeError("DATABASE_URL must include a database name; set DATABASE_URL_TEST for tests.")
    return url.set(database=f"{url.database}_test").render_as_string(hide_password=False)


def _ensure_test_database_exists(test_url: str) -> None:
    url = make_url(test_url)
    if not url.database:
        raise RuntimeError("DATABASE_URL_TEST must include a database name.")
    db_name = url.database
    admin_dsn = _normalize_psycopg_dsn(
        url.set(database="postgres").render_as_string(hide_password=False)
    )
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        exists = conn.execute(
            "select 1 from pg_database where datname = %s",
            (db_name,),
        ).fetchone()
        if not exists:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))


def _set_test_database_url() -> str:
    test_url = _get_test_database_url()
    os.environ["DATABASE_URL"] = test_url
    get_settings.cache_clear()
    return test_url


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
    test_url = _set_test_database_url()
    _ensure_test_database_exists(test_url)
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


@pytest_asyncio.fixture(autouse=True)
async def reset_db(db_sessionmaker):
    async with db_sessionmaker() as session:
        await session.execute(
            text(
                "TRUNCATE abuse_events, capture_events, content_reports, captures, "
                "checkin_tokens, checkin_challenges, curator_rank_cache, curator_rank_daily, "
                "tip_receipts, tip_intents, nodes, artists, rank_events, devices, sessions, users "
                "RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()
    yield


@pytest_asyncio.fixture
async def client(media_dir):
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
