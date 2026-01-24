from __future__ import annotations

import asyncio
import os

import asyncpg
from sqlalchemy.engine import make_url


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _build_admin_url(database_url: str) -> tuple[str, str]:
    url = make_url(database_url)
    target_database = url.database or "groundedart"
    driver = "postgresql" if url.drivername.startswith("postgresql+") else url.drivername
    admin_url = url.set(database="postgres", drivername=driver).render_as_string(
        hide_password=False
    )
    return admin_url, target_database


async def ensure_database() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required to ensure the database exists.")

    admin_url, target_database = _build_admin_url(database_url)
    if target_database in {"postgres", ""}:
        return

    conn = await asyncpg.connect(admin_url)
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            target_database,
        )
        if exists:
            return
        await conn.execute(f"CREATE DATABASE {_quote_identifier(target_database)}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(ensure_database())
