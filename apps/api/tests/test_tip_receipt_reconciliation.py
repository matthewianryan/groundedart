from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from groundedart_api.db.models import Artist, Node, TipIntent, TipReceipt, User
from groundedart_api.domain.tip_receipts_reconciliation import reconcile_tip_receipts


@pytest.mark.asyncio
async def test_tip_receipt_reconciliation_updates_finalized(db_sessionmaker) -> None:
    now = dt.datetime(2024, 1, 1, tzinfo=dt.UTC)
    old_checked_at = now - dt.timedelta(seconds=120)

    user_id = uuid.uuid4()
    node_id = uuid.uuid4()
    artist_id = uuid.uuid4()
    tip_intent_id = uuid.uuid4()
    recent_tip_intent_id = uuid.uuid4()

    async with db_sessionmaker() as session:
        session.add(User(id=user_id))
        session.add(
            Artist(
                id=artist_id,
                display_name="Tip Artist",
                solana_recipient_pubkey="4Nd1m6WnQ1yMJJGx7JizZ3chx7EAFhcbuFZ6g7e1Pi2m",
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
        await session.flush()
        session.add(
            TipIntent(
                id=tip_intent_id,
                node_id=node_id,
                artist_id=artist_id,
                amount_lamports=12345,
                to_pubkey="4Nd1m6WnQ1yMJJGx7JizZ3chx7EAFhcbuFZ6g7e1Pi2m",
                created_by_user_id=user_id,
                expires_at=now + dt.timedelta(hours=1),
                status="open",
            )
        )
        session.add(
            TipIntent(
                id=recent_tip_intent_id,
                node_id=node_id,
                artist_id=artist_id,
                amount_lamports=12345,
                to_pubkey="4Nd1m6WnQ1yMJJGx7JizZ3chx7EAFhcbuFZ6g7e1Pi2m",
                created_by_user_id=user_id,
                expires_at=now + dt.timedelta(hours=1),
                status="open",
            )
        )
        session.add(
            TipReceipt(
                tip_intent_id=tip_intent_id,
                tx_signature="sig-old",
                from_pubkey=None,
                to_pubkey="4Nd1m6WnQ1yMJJGx7JizZ3chx7EAFhcbuFZ6g7e1Pi2m",
                amount_lamports=12345,
                slot=None,
                block_time=None,
                confirmation_status="confirmed",
                first_seen_at=old_checked_at,
                last_checked_at=old_checked_at,
                failure_reason=None,
            )
        )
        session.add(
            TipReceipt(
                tip_intent_id=recent_tip_intent_id,
                tx_signature="sig-recent",
                from_pubkey=None,
                to_pubkey="4Nd1m6WnQ1yMJJGx7JizZ3chx7EAFhcbuFZ6g7e1Pi2m",
                amount_lamports=12345,
                slot=None,
                block_time=None,
                confirmation_status="seen",
                first_seen_at=now - dt.timedelta(seconds=30),
                last_checked_at=now - dt.timedelta(seconds=30),
                failure_reason=None,
            )
        )
        await session.commit()

    calls: list[str] = []

    async def _fake_fetch(
        _rpc_url: str, tx_signature: str, commitment: str | None
    ) -> dict[str, object]:
        assert commitment == "finalized"
        calls.append(tx_signature)
        return {
            "result": {
                "slot": 555,
                "blockTime": 1_700_000_000,
                "confirmationStatus": "finalized",
            }
        }

    async with db_sessionmaker() as session:
        processed = await reconcile_tip_receipts(
            session,
            rpc_url="https://rpc.example.test",
            now=now,
            reconciliation_interval=dt.timedelta(seconds=60),
            missing_cutoff=dt.timedelta(hours=1),
            fetch_transaction=_fake_fetch,
        )

        assert processed == 1
        assert calls == ["sig-old"]

        receipt = await session.scalar(
            select(TipReceipt).where(TipReceipt.tx_signature == "sig-old")
        )
        assert receipt is not None
        assert receipt.confirmation_status == "finalized"
        assert receipt.slot == 555
        assert receipt.block_time == dt.datetime.fromtimestamp(1_700_000_000, tz=dt.UTC)
        assert receipt.last_checked_at == now

        recent = await session.scalar(
            select(TipReceipt).where(TipReceipt.tx_signature == "sig-recent")
        )
        assert recent is not None
        assert recent.confirmation_status == "seen"
        assert recent.last_checked_at == now - dt.timedelta(seconds=30)
