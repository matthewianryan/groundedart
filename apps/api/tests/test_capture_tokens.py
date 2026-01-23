from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import CheckinToken, Node, utcnow
from groundedart_api.settings import get_settings


async def create_session(client: AsyncClient) -> uuid.UUID:
    response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": str(uuid.uuid4())},
    )
    assert response.status_code == 200
    return uuid.UUID(response.json()["user_id"])


async def create_node(db_sessionmaker) -> uuid.UUID:
    node_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(
            Node(
                id=node_id,
                name="Capture Node",
                category="mural",
                description=None,
                location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                radius_m=25,
                min_rank=0,
            )
        )
        await session.commit()
    return node_id


async def insert_checkin_token(
    db_sessionmaker,
    *,
    user_id: uuid.UUID,
    node_id: uuid.UUID,
    token: str,
    expires_at: dt.datetime,
    used_at: dt.datetime | None = None,
) -> None:
    settings = get_settings()
    token_hash = hash_opaque_token(token, settings)
    async with db_sessionmaker() as session:
        session.add(
            CheckinToken(
                user_id=user_id,
                node_id=node_id,
                token_hash=token_hash,
                expires_at=expires_at,
                used_at=used_at,
            )
        )
        await session.commit()


@pytest.mark.asyncio
async def test_create_capture_invalid_token(db_sessionmaker, client: AsyncClient) -> None:
    node_id = await create_node(db_sessionmaker)
    await create_session(client)

    response = await client.post(
        "/v1/captures",
        json={
            "node_id": str(node_id),
            "checkin_token": "not-a-real-token",
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "invalid_checkin_token"


@pytest.mark.asyncio
async def test_create_capture_expired_token(db_sessionmaker, client: AsyncClient) -> None:
    node_id = await create_node(db_sessionmaker)
    user_id = await create_session(client)
    token = generate_opaque_token()

    await insert_checkin_token(
        db_sessionmaker,
        user_id=user_id,
        node_id=node_id,
        token=token,
        expires_at=utcnow() - dt.timedelta(seconds=1),
    )

    response = await client.post(
        "/v1/captures",
        json={
            "node_id": str(node_id),
            "checkin_token": token,
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "checkin_token_expired"


@pytest.mark.asyncio
async def test_create_capture_reused_token(db_sessionmaker, client: AsyncClient) -> None:
    node_id = await create_node(db_sessionmaker)
    user_id = await create_session(client)
    token = generate_opaque_token()

    await insert_checkin_token(
        db_sessionmaker,
        user_id=user_id,
        node_id=node_id,
        token=token,
        expires_at=utcnow() + dt.timedelta(seconds=30),
    )

    first = await client.post(
        "/v1/captures",
        json={
            "node_id": str(node_id),
            "checkin_token": token,
        },
    )
    assert first.status_code == 200

    second = await client.post(
        "/v1/captures",
        json={
            "node_id": str(node_id),
            "checkin_token": token,
        },
    )
    assert second.status_code == 400
    payload = second.json()
    assert payload["error"]["code"] == "invalid_checkin_token"


@pytest.mark.asyncio
async def test_create_capture_wrong_node(db_sessionmaker, client: AsyncClient) -> None:
    node_id = await create_node(db_sessionmaker)
    other_node_id = await create_node(db_sessionmaker)
    user_id = await create_session(client)
    token = generate_opaque_token()

    await insert_checkin_token(
        db_sessionmaker,
        user_id=user_id,
        node_id=node_id,
        token=token,
        expires_at=utcnow() + dt.timedelta(seconds=30),
    )

    response = await client.post(
        "/v1/captures",
        json={
            "node_id": str(other_node_id),
            "checkin_token": token,
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "invalid_checkin_token"
