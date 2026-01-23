from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient
from sqlalchemy import select

from groundedart_api.auth.tokens import hash_opaque_token
from groundedart_api.db.models import CheckinChallenge, CheckinToken, Node, utcnow
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
                name="Checkin Node",
                category="mural",
                description=None,
                location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                radius_m=25,
                min_rank=0,
            )
        )
        await session.commit()
    return node_id


@pytest.mark.asyncio
async def test_checkin_invalid_challenge(db_sessionmaker, client: AsyncClient):
    node_id = await create_node(db_sessionmaker)
    await create_session(client)

    response = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": str(uuid.uuid4()),
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": 10,
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "invalid_challenge"
    assert payload["error"]["details"] == {}


@pytest.mark.asyncio
async def test_checkin_expired_challenge(db_sessionmaker, client: AsyncClient):
    node_id = await create_node(db_sessionmaker)
    user_id = await create_session(client)
    challenge_id = uuid.uuid4()

    async with db_sessionmaker() as session:
        expires_at = utcnow() - dt.timedelta(seconds=1)
        session.add(
            CheckinChallenge(
                id=challenge_id,
                user_id=user_id,
                node_id=node_id,
                expires_at=expires_at,
            )
        )
        await session.commit()

    response = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": str(challenge_id),
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": 10,
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "challenge_expired"


@pytest.mark.asyncio
async def test_checkin_used_challenge(db_sessionmaker, client: AsyncClient):
    node_id = await create_node(db_sessionmaker)
    user_id = await create_session(client)
    challenge_id = uuid.uuid4()

    async with db_sessionmaker() as session:
        session.add(
            CheckinChallenge(
                id=challenge_id,
                user_id=user_id,
                node_id=node_id,
                expires_at=utcnow() + dt.timedelta(seconds=30),
                used_at=utcnow(),
            )
        )
        await session.commit()

    response = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": str(challenge_id),
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": 10,
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "challenge_used"


@pytest.mark.asyncio
async def test_checkin_accuracy_too_low(db_sessionmaker, client: AsyncClient):
    node_id = await create_node(db_sessionmaker)
    await create_session(client)

    challenge_response = await client.post(f"/v1/nodes/{node_id}/checkins/challenge")
    assert challenge_response.status_code == 200

    response = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": challenge_response.json()["challenge_id"],
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": 500,
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "location_accuracy_too_low"
    assert payload["error"]["details"]["accuracy_m"] == 500


@pytest.mark.asyncio
async def test_checkin_outside_geofence(db_sessionmaker, client: AsyncClient):
    node_id = await create_node(db_sessionmaker)
    await create_session(client)

    challenge_response = await client.post(f"/v1/nodes/{node_id}/checkins/challenge")
    assert challenge_response.status_code == 200

    response = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": challenge_response.json()["challenge_id"],
            "lat": 0.0,
            "lng": 0.0,
            "accuracy_m": 10,
        },
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["error"]["code"] == "outside_geofence"
    assert payload["error"]["details"]["radius_m"] == 25
    assert payload["error"]["details"]["distance_m"] > 25


@pytest.mark.asyncio
async def test_checkin_success(db_sessionmaker, client: AsyncClient):
    node_id = await create_node(db_sessionmaker)
    user_id = await create_session(client)

    challenge_response = await client.post(f"/v1/nodes/{node_id}/checkins/challenge")
    assert challenge_response.status_code == 200

    response = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": challenge_response.json()["challenge_id"],
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": 10,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["checkin_token"]

    settings = get_settings()
    token_hash = hash_opaque_token(payload["checkin_token"], settings)
    async with db_sessionmaker() as session:
        token = await session.scalar(
            select(CheckinToken).where(
                CheckinToken.token_hash == token_hash,
                CheckinToken.user_id == user_id,
                CheckinToken.node_id == node_id,
            )
        )
        assert token is not None
        assert token.used_at is None
