from __future__ import annotations

import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient
from sqlalchemy import select

from groundedart_api.db.models import Artist, Node, TipIntent


async def create_session(client: AsyncClient) -> uuid.UUID:
    response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": str(uuid.uuid4())},
    )
    assert response.status_code == 200
    return uuid.UUID(response.json()["user_id"])


async def create_artist_and_node(db_sessionmaker) -> tuple[uuid.UUID, uuid.UUID, str]:
    node_id = uuid.uuid4()
    artist_id = uuid.uuid4()
    pubkey = "4Nd1m6WnQ1yMJJGx7JizZ3chx7EAFhcbuFZ6g7e1Pi2m"
    async with db_sessionmaker() as session:
        session.add(
            Artist(
                id=artist_id,
                display_name="Tip Artist",
                solana_recipient_pubkey=pubkey,
            )
        )
        session.add(
            Node(
                id=node_id,
                name="Tip Node",
                category="mural",
                description=None,
                location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                radius_m=25,
                min_rank=0,
                default_artist_id=artist_id,
            )
        )
        await session.commit()
    return node_id, artist_id, pubkey


async def create_node_without_artist(db_sessionmaker) -> uuid.UUID:
    node_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(
            Node(
                id=node_id,
                name="Untipped Node",
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
async def test_tip_intent_happy_path(db_sessionmaker, client: AsyncClient) -> None:
    node_id, artist_id, pubkey = await create_artist_and_node(db_sessionmaker)
    await create_session(client)

    response = await client.post(
        "/v1/tips/intents",
        json={"node_id": str(node_id), "amount_lamports": 12345},
    )

    assert response.status_code == 200
    payload = response.json()
    tip_intent_id = uuid.UUID(payload["tip_intent_id"])
    assert payload["to_pubkey"] == pubkey
    assert payload["amount_lamports"] == 12345
    assert payload["cluster"] == "devnet"
    assert str(tip_intent_id) in payload["memo_text"]
    assert len(payload["memo_text"].encode("utf-8")) <= 256

    async with db_sessionmaker() as session:
        tip_intent = await session.scalar(
            select(TipIntent).where(TipIntent.id == tip_intent_id)
        )
        assert tip_intent is not None
        assert tip_intent.node_id == node_id
        assert tip_intent.artist_id == artist_id
        assert tip_intent.amount_lamports == 12345
        assert tip_intent.to_pubkey == pubkey


@pytest.mark.asyncio
async def test_tip_intent_invalid_amount_returns_error(client: AsyncClient) -> None:
    await create_session(client)
    response = await client.post(
        "/v1/tips/intents",
        json={"node_id": str(uuid.uuid4()), "amount_lamports": 0},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_tip_amount"


@pytest.mark.asyncio
async def test_tip_intent_missing_default_artist_returns_error(
    db_sessionmaker, client: AsyncClient
) -> None:
    node_id = await create_node_without_artist(db_sessionmaker)
    await create_session(client)

    response = await client.post(
        "/v1/tips/intents",
        json={"node_id": str(node_id), "amount_lamports": 1000},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "node_missing_default_artist"
