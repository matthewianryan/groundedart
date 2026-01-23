from __future__ import annotations

import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient
from sqlalchemy import select

from groundedart_api.db.models import Artist, Node, TipReceipt
from groundedart_api.domain import tip_receipts_solana


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


def _mock_tx_result(
    *,
    tip_intent_id: uuid.UUID,
    from_pubkey: str,
    to_pubkey: str,
    amount_lamports: int,
    memo_text: str | None,
    confirmation_status: str = "confirmed",
) -> dict[str, object]:
    instructions: list[dict[str, object]] = [
        {
            "program": "system",
            "parsed": {
                "type": "transfer",
                "info": {
                    "source": from_pubkey,
                    "destination": to_pubkey,
                    "lamports": amount_lamports,
                },
            },
        },
    ]
    if memo_text is not None:
        instructions.append(
            {"program": "spl-memo", "parsed": f"{memo_text}{tip_intent_id}"}
        )
    return {
        "jsonrpc": "2.0",
        "result": {
            "slot": 123,
            "blockTime": 1_700_000_000,
            "confirmationStatus": confirmation_status,
            "meta": {"err": None},
            "transaction": {"message": {"instructions": instructions}},
        },
    }


@pytest.mark.asyncio
async def test_tip_confirm_happy_path(
    db_sessionmaker, client: AsyncClient, monkeypatch
) -> None:
    node_id, _artist_id, pubkey = await create_artist_and_node(db_sessionmaker)
    await create_session(client)
    tip_intent_id = await create_tip_intent(client, node_id, 12345)
    tx_signature = "5m9h4f7f1B7uD1a6iC7H2M2T6B4Gkq9Q3xU9f7jkh9zz1"

    async def _fake_fetch(
        _rpc_url: str, _tx_signature: str, commitment: str | None
    ) -> dict[str, object]:
        assert commitment == "confirmed"
        return _mock_tx_result(
            tip_intent_id=tip_intent_id,
            from_pubkey="6bHW7K6q1w8b9C2q3Q4w9z6z1Z2Z9w8x7a3b1c2d3e4f",
            to_pubkey=pubkey,
            amount_lamports=12345,
            memo_text="ga_tip_intent:",
        )

    monkeypatch.setattr(tip_receipts_solana, "fetch_solana_transaction", _fake_fetch)

    response = await client.post(
        "/v1/tips/confirm",
        json={"tip_intent_id": str(tip_intent_id), "tx_signature": tx_signature},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["tip_intent_id"] == str(tip_intent_id)
    assert payload["tx_signature"] == tx_signature
    assert payload["to_pubkey"] == pubkey
    assert payload["amount_lamports"] == 12345
    assert payload["confirmation_status"] == "confirmed"
    assert payload["failure_reason"] is None

    async with db_sessionmaker() as session:
        receipt = await session.scalar(
            select(TipReceipt).where(TipReceipt.tip_intent_id == tip_intent_id)
        )
        assert receipt is not None
        assert receipt.tx_signature == tx_signature
        assert receipt.to_pubkey == pubkey
        assert receipt.amount_lamports == 12345


@pytest.mark.asyncio
async def test_tip_confirm_missing_memo_records_failure(
    db_sessionmaker, client: AsyncClient, monkeypatch
) -> None:
    node_id, _artist_id, pubkey = await create_artist_and_node(db_sessionmaker)
    await create_session(client)
    tip_intent_id = await create_tip_intent(client, node_id, 5000)
    tx_signature = "8nF1b9Yv7a6d3C9f1P9w6Z2d4Z6j4a9f7B6G2X3y1z5s"

    async def _fake_fetch(
        _rpc_url: str, _tx_signature: str, commitment: str | None
    ) -> dict[str, object]:
        assert commitment == "confirmed"
        return _mock_tx_result(
            tip_intent_id=tip_intent_id,
            from_pubkey="6bHW7K6q1w8b9C2q3Q4w9z6z1Z2Z9w8x7a3b1c2d3e4f",
            to_pubkey=pubkey,
            amount_lamports=5000,
            memo_text=None,
        )

    monkeypatch.setattr(tip_receipts_solana, "fetch_solana_transaction", _fake_fetch)

    response = await client.post(
        "/v1/tips/confirm",
        json={"tip_intent_id": str(tip_intent_id), "tx_signature": tx_signature},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["confirmation_status"] == "failed"
    assert payload["failure_reason"] == "memo_missing"


@pytest.mark.asyncio
async def test_tip_confirm_reuses_existing_receipt(
    db_sessionmaker, client: AsyncClient, monkeypatch
) -> None:
    node_id, _artist_id, pubkey = await create_artist_and_node(db_sessionmaker)
    await create_session(client)
    tip_intent_id = await create_tip_intent(client, node_id, 1000)
    tx_signature = "4q7H6g3m2k1J7c8v5t9m2n8Q6w1x3z5p2o9r7s6t5u4"

    async def _fake_fetch(
        _rpc_url: str, _tx_signature: str, commitment: str | None
    ) -> dict[str, object]:
        assert commitment == "confirmed"
        return _mock_tx_result(
            tip_intent_id=tip_intent_id,
            from_pubkey="6bHW7K6q1w8b9C2q3Q4w9z6z1Z2Z9w8x7a3b1c2d3e4f",
            to_pubkey=pubkey,
            amount_lamports=1000,
            memo_text="ga_tip_intent:",
        )

    monkeypatch.setattr(tip_receipts_solana, "fetch_solana_transaction", _fake_fetch)

    first = await client.post(
        "/v1/tips/confirm",
        json={"tip_intent_id": str(tip_intent_id), "tx_signature": tx_signature},
    )
    assert first.status_code == 200

    second = await client.post(
        "/v1/tips/confirm",
        json={"tip_intent_id": str(tip_intent_id), "tx_signature": tx_signature},
    )
    assert second.status_code == 200
    assert second.json()["tx_signature"] == tx_signature

    async with db_sessionmaker() as session:
        receipts = await session.scalars(
            select(TipReceipt).where(TipReceipt.tip_intent_id == tip_intent_id)
        )
        assert len(receipts.all()) == 1
