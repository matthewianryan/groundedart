from __future__ import annotations

import asyncio
import datetime as dt
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from groundedart_api.db.models import CuratorRankCache, Device, User
from groundedart_api.main import create_app
from groundedart_api.settings import get_settings
from groundedart_api.time import get_utcnow


def make_client_with_time(now: dt.datetime) -> tuple[AsyncClient, dict[str, dt.datetime]]:
    app = create_app()
    time_state = {"now": now}

    def _now() -> dt.datetime:
        return time_state["now"]

    def _override_get_utcnow():
        return _now

    app.dependency_overrides[get_utcnow] = _override_get_utcnow
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    return client, time_state


@pytest.mark.asyncio
async def test_anonymous_session_creates_user_device_and_rank_cache_on_first_read(
    db_sessionmaker, client: AsyncClient
) -> None:
    device_id = uuid.uuid4()
    response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": str(device_id)},
    )

    assert response.status_code == 200
    user_id = uuid.UUID(response.json()["user_id"])

    async with db_sessionmaker() as session:
        user = await session.get(User, user_id)
        assert user is not None
        device = await session.scalar(select(Device).where(Device.device_id == str(device_id)))
        assert device is not None
        assert device.user_id == user_id

    me = await client.get("/v1/me")
    assert me.status_code == 200
    assert me.json()["rank"] == 0

    async with db_sessionmaker() as session:
        cache = await session.get(CuratorRankCache, user_id)
        assert cache is not None
        assert cache.points_total == 0


@pytest.mark.asyncio
async def test_anonymous_session_reuses_device_and_updates_last_seen(
    db_sessionmaker,
) -> None:
    device_id = uuid.uuid4()
    start = dt.datetime(2024, 1, 1, tzinfo=dt.UTC)
    client, time_state = make_client_with_time(start)

    async with client:
        first = await client.post(
            "/v1/sessions/anonymous",
            json={"device_id": str(device_id)},
        )
        assert first.status_code == 200
        first_user_id = uuid.UUID(first.json()["user_id"])

        later = start + dt.timedelta(minutes=5)
        time_state["now"] = later

        second = await client.post(
            "/v1/sessions/anonymous",
            json={"device_id": str(device_id)},
        )
        assert second.status_code == 200
        assert uuid.UUID(second.json()["user_id"]) == first_user_id

    async with db_sessionmaker() as session:
        device = await session.scalar(select(Device).where(Device.device_id == str(device_id)))
        assert device is not None
        assert device.user_id == first_user_id
        assert device.last_seen_at == later
        user_count = await session.scalar(select(func.count()).select_from(User))
        assert user_count == 1


@pytest.mark.asyncio
async def test_anonymous_session_is_idempotent_under_concurrent_requests(client: AsyncClient) -> None:
    device_id = uuid.uuid4()

    async def _create() -> tuple[int, dict]:
        response = await client.post(
            "/v1/sessions/anonymous",
            json={"device_id": str(device_id)},
        )
        return response.status_code, response.json()

    (status_a, payload_a), (status_b, payload_b) = await asyncio.gather(_create(), _create())

    assert status_a == 200
    assert status_b == 200
    assert payload_a["user_id"] == payload_b["user_id"]


@pytest.mark.asyncio
async def test_anonymous_session_sets_cookie_attributes(client: AsyncClient) -> None:
    response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": str(uuid.uuid4())},
    )

    assert response.status_code == 200
    settings = get_settings()
    cookie_value = response.cookies.get(settings.session_cookie_name)
    assert cookie_value

    cookie_header = response.headers.get("set-cookie")
    assert cookie_header is not None
    cookie_lower = cookie_header.lower()
    assert cookie_header.startswith(f"{settings.session_cookie_name}=")
    assert "httponly" in cookie_lower
    assert f"samesite={settings.session_cookie_samesite}" in cookie_lower
    assert "path=/" in cookie_lower
    assert f"max-age={settings.session_ttl_seconds}" in cookie_lower
    if settings.session_cookie_domain:
        assert f"domain={settings.session_cookie_domain.lower()}" in cookie_lower
    if settings.session_cookie_secure:
        assert "; secure" in cookie_lower or ";secure" in cookie_lower
    else:
        assert "; secure" not in cookie_lower
        assert ";secure" not in cookie_lower


@pytest.mark.asyncio
async def test_anonymous_session_expires_at_matches_ttl() -> None:
    settings = get_settings()
    start = dt.datetime(2024, 1, 1, tzinfo=dt.UTC)
    client, _ = make_client_with_time(start)

    async with client:
        response = await client.post(
            "/v1/sessions/anonymous",
            json={"device_id": str(uuid.uuid4())},
        )

    assert response.status_code == 200
    expires_at = dt.datetime.fromisoformat(response.json()["session_expires_at"])
    expected = start + dt.timedelta(seconds=settings.session_ttl_seconds)
    assert expires_at == expected


@pytest.mark.asyncio
async def test_anonymous_session_rejects_invalid_device_id(client: AsyncClient) -> None:
    response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": "not-a-uuid"},
    )

    assert response.status_code == 422
