from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient

from groundedart_api.db.models import Artist, Node, TipReceipt


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


async def create_tip_intent(
    client: AsyncClient, node_id: uuid.UUID, amount_lamports: int
) -> uuid.UUID:
    response = await client.post(
        "/v1/tips/intents",
        json={"node_id": str(node_id), "amount_lamports": amount_lamports},
    )
    assert response.status_code == 200
    return uuid.UUID(response.json()["tip_intent_id"])


@pytest.mark.asyncio
async def test_node_tips_empty_state(db_sessionmaker, client: AsyncClient) -> None:
    node_id, _artist_id, _pubkey = await create_artist_and_node(db_sessionmaker)

    response = await client.get(f"/v1/nodes/{node_id}/tips")

    assert response.status_code == 200
    payload = response.json()
    assert payload["node_id"] == str(node_id)
    assert payload["total_amount_lamports"] == 0
    assert payload["total_amount_sol"] == "0.000000000"
    assert payload["recent_receipts"] == []


@pytest.mark.asyncio
async def test_node_tips_mixed_status_receipts(
    db_sessionmaker, client: AsyncClient
) -> None:
    node_id, _artist_id, pubkey = await create_artist_and_node(db_sessionmaker)
    other_node_id, _other_artist_id, other_pubkey = await create_artist_and_node(
        db_sessionmaker
    )
    await create_session(client)

    amounts = [1000, 2000, 3000, 4000]
    tip_intent_ids = [
        await create_tip_intent(client, node_id, amount) for amount in amounts
    ]
    other_tip_intent_id = await create_tip_intent(client, other_node_id, 9999)

    base_time = dt.datetime(2024, 1, 1, tzinfo=dt.timezone.utc)
    receipts = [
        TipReceipt(
            tip_intent_id=tip_intent_ids[0],
            tx_signature="sig-confirmed",
            from_pubkey="from-1",
            to_pubkey=pubkey,
            amount_lamports=amounts[0],
            slot=1,
            block_time=base_time,
            confirmation_status="confirmed",
            first_seen_at=base_time,
            last_checked_at=base_time + dt.timedelta(seconds=10),
            failure_reason=None,
        ),
        TipReceipt(
            tip_intent_id=tip_intent_ids[1],
            tx_signature="sig-finalized",
            from_pubkey="from-2",
            to_pubkey=pubkey,
            amount_lamports=amounts[1],
            slot=2,
            block_time=base_time + dt.timedelta(minutes=1),
            confirmation_status="finalized",
            first_seen_at=base_time + dt.timedelta(minutes=1),
            last_checked_at=base_time + dt.timedelta(minutes=1, seconds=10),
            failure_reason=None,
        ),
        TipReceipt(
            tip_intent_id=tip_intent_ids[2],
            tx_signature="sig-seen",
            from_pubkey="from-3",
            to_pubkey=pubkey,
            amount_lamports=amounts[2],
            slot=3,
            block_time=base_time + dt.timedelta(minutes=2),
            confirmation_status="seen",
            first_seen_at=base_time + dt.timedelta(minutes=2),
            last_checked_at=base_time + dt.timedelta(minutes=2, seconds=10),
            failure_reason=None,
        ),
        TipReceipt(
            tip_intent_id=tip_intent_ids[3],
            tx_signature="sig-failed",
            from_pubkey=None,
            to_pubkey=pubkey,
            amount_lamports=amounts[3],
            slot=None,
            block_time=None,
            confirmation_status="failed",
            first_seen_at=base_time + dt.timedelta(minutes=3),
            last_checked_at=base_time + dt.timedelta(minutes=3, seconds=10),
            failure_reason="memo_missing",
        ),
        TipReceipt(
            tip_intent_id=other_tip_intent_id,
            tx_signature="sig-other",
            from_pubkey="from-4",
            to_pubkey=other_pubkey,
            amount_lamports=9999,
            slot=4,
            block_time=base_time + dt.timedelta(minutes=4),
            confirmation_status="finalized",
            first_seen_at=base_time + dt.timedelta(minutes=4),
            last_checked_at=base_time + dt.timedelta(minutes=4, seconds=10),
            failure_reason=None,
        ),
    ]

    async with db_sessionmaker() as session:
        session.add_all(receipts)
        await session.commit()

    response = await client.get(f"/v1/nodes/{node_id}/tips")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_amount_lamports"] == 3000
    assert payload["total_amount_sol"] == "0.000003000"

    recent = payload["recent_receipts"]
    assert len(recent) == 4
    assert [item["confirmation_status"] for item in recent] == [
        "failed",
        "seen",
        "finalized",
        "confirmed",
    ]
    assert recent[0]["tx_signature"] == "sig-failed"
    assert recent[-1]["tx_signature"] == "sig-confirmed"
