from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import Capture, CuratorProfile, CuratorRankEvent, Node, Session, User
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.settings import get_settings


def _rank_event_timestamp(base_time: dt.datetime, index: int) -> dt.datetime:
    day_offset = index // 3
    minute_offset = index % 3
    return base_time + dt.timedelta(days=day_offset, minutes=minute_offset)


async def create_user_session(
    db_sessionmaker,
    *,
    expires_at: dt.datetime,
    revoked_at: dt.datetime | None = None,
    rank: int = 0,
) -> tuple[uuid.UUID, str]:
    settings = get_settings()
    token = generate_opaque_token()
    token_hash = hash_opaque_token(token, settings)
    async with db_sessionmaker() as session:
        user = User()
        session.add(user)
        await session.flush()
        session.add(CuratorProfile(user_id=user.id, rank=rank))
        if rank > 0:
            now = dt.datetime.now(dt.UTC)
            for idx in range(rank):
                node_id = uuid.uuid4()
                capture_id = uuid.uuid4()
                session.add(
                    Node(
                        id=node_id,
                        name=f"Rank Node {idx}",
                        category="mural",
                        description=None,
                        location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                        radius_m=25,
                        min_rank=0,
                    )
                )
                await session.flush()
                session.add(
                    Capture(
                        id=capture_id,
                        user_id=user.id,
                        node_id=node_id,
                        state=CaptureState.verified.value,
                    )
                )
                session.add(
                    CuratorRankEvent(
                        id=uuid.uuid4(),
                        user_id=user.id,
                        event_type="capture_verified",
                        delta=1,
                        rank_version="v1_points",
                        capture_id=capture_id,
                        node_id=node_id,
                        created_at=_rank_event_timestamp(now, idx),
                        details={"source": "test_seed"},
                    )
                )
        session.add(
            Session(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expires_at,
                revoked_at=revoked_at,
            )
        )
        await session.commit()
    return user.id, token


async def create_ranked_nodes(db_sessionmaker) -> tuple[uuid.UUID, uuid.UUID]:
    public_id = uuid.uuid4()
    restricted_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add_all(
            [
                Node(
                    id=public_id,
                    name="Public Node",
                    category="mural",
                    description=None,
                    location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                    radius_m=25,
                    min_rank=0,
                ),
                Node(
                    id=restricted_id,
                    name="Restricted Node",
                    category="mural",
                    description=None,
                    location=WKTElement("POINT(-122.41 37.79)", srid=4326),
                    radius_m=25,
                    min_rank=1,
                ),
            ]
        )
        await session.commit()
    return public_id, restricted_id


@pytest.mark.asyncio
async def test_me_requires_auth(db_sessionmaker, client: AsyncClient) -> None:
    response = await client.get("/v1/me")
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "auth_required"

    settings = get_settings()
    client.cookies.set(settings.session_cookie_name, "not-a-real-cookie")
    response = await client.get("/v1/me")
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "auth_required"

    _, token = await create_user_session(
        db_sessionmaker,
        expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(seconds=1),
    )
    client.cookies.set(settings.session_cookie_name, token)
    response = await client.get("/v1/me")
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "auth_required"


@pytest.mark.asyncio
async def test_me_returns_user_with_cookie(client: AsyncClient) -> None:
    response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": str(uuid.uuid4())},
    )
    assert response.status_code == 200
    user_id = response.json()["user_id"]

    me = await client.get("/v1/me")
    assert me.status_code == 200
    payload = me.json()
    assert payload["user_id"] == user_id


@pytest.mark.asyncio
async def test_nodes_allow_anonymous_rank_zero(db_sessionmaker, client: AsyncClient) -> None:
    public_id, restricted_id = await create_ranked_nodes(db_sessionmaker)

    response = await client.get("/v1/nodes")
    assert response.status_code == 200
    payload = response.json()
    node_ids = {node["id"] for node in payload["nodes"]}
    assert str(public_id) in node_ids
    assert str(restricted_id) not in node_ids


@pytest.mark.asyncio
async def test_nodes_treat_expired_or_revoked_sessions_as_anonymous(
    db_sessionmaker,
    client: AsyncClient,
) -> None:
    public_id, restricted_id = await create_ranked_nodes(db_sessionmaker)
    settings = get_settings()

    _, expired_token = await create_user_session(
        db_sessionmaker,
        expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(seconds=1),
        rank=1,
    )
    client.cookies.set(settings.session_cookie_name, expired_token)
    expired_response = await client.get("/v1/nodes")
    assert expired_response.status_code == 200
    expired_ids = {node["id"] for node in expired_response.json()["nodes"]}
    assert str(public_id) in expired_ids
    assert str(restricted_id) not in expired_ids

    _, revoked_token = await create_user_session(
        db_sessionmaker,
        expires_at=dt.datetime.now(dt.UTC) + dt.timedelta(hours=1),
        revoked_at=dt.datetime.now(dt.UTC),
        rank=1,
    )
    client.cookies.set(settings.session_cookie_name, revoked_token)
    revoked_response = await client.get("/v1/nodes")
    assert revoked_response.status_code == 200
    revoked_ids = {node["id"] for node in revoked_response.json()["nodes"]}
    assert str(public_id) in revoked_ids
    assert str(restricted_id) not in revoked_ids
