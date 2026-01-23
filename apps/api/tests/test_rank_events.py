from __future__ import annotations

import datetime as dt
from pathlib import Path
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient
from sqlalchemy import select

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import CheckinToken, CuratorRankEvent, Node, utcnow
from groundedart_api.domain.rank_projection import compute_rank_projection
from groundedart_api.settings import get_settings

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def load_fixture_bytes(name: str) -> bytes:
    return (FIXTURES_DIR / name).read_bytes()


async def create_pending_capture(
    db_sessionmaker,
    client: AsyncClient,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    node_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(
            Node(
                id=node_id,
                name="Rank Event Node",
                category="mural",
                description=None,
                location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                radius_m=25,
                min_rank=0,
            )
        )
        await session.commit()

    session_response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": str(uuid.uuid4())},
    )
    assert session_response.status_code == 200
    user_id = uuid.UUID(session_response.json()["user_id"])

    token = generate_opaque_token()
    settings = get_settings()
    token_hash = hash_opaque_token(token, settings)
    async with db_sessionmaker() as session:
        session.add(
            CheckinToken(
                user_id=user_id,
                node_id=node_id,
                token_hash=token_hash,
                expires_at=utcnow() + dt.timedelta(seconds=30),
            )
        )
        await session.commit()

    capture_response = await client.post(
        "/v1/captures",
        json={"node_id": str(node_id), "checkin_token": token},
    )
    assert capture_response.status_code == 200
    capture_id = uuid.UUID(capture_response.json()["capture"]["id"])

    fixture_bytes = load_fixture_bytes("tiny.png")
    upload_response = await client.post(
        f"/v1/captures/{capture_id}/image",
        files={"file": ("tiny.png", fixture_bytes, "image/png")},
    )
    assert upload_response.status_code == 200
    return capture_id, node_id, user_id


@pytest.mark.asyncio
async def test_verified_capture_emits_rank_event_and_updates_projection(
    db_sessionmaker,
    client: AsyncClient,
) -> None:
    capture_id, node_id, user_id = await create_pending_capture(db_sessionmaker, client)
    settings = get_settings()

    response = await client.post(
        f"/v1/admin/captures/{capture_id}/transition",
        headers={"X-Admin-Token": settings.admin_api_token},
        json={"target_state": "verified", "reason_code": "manual_review_pass"},
    )
    assert response.status_code == 200

    async with db_sessionmaker() as session:
        events = (
            await session.scalars(
                select(CuratorRankEvent).where(CuratorRankEvent.user_id == user_id)
            )
        ).all()
        assert len(events) == 1
        event = events[0]
        assert event.event_type == "capture_verified"
        assert event.capture_id == capture_id
        assert event.node_id == node_id
        assert event.delta == 1

        projection = await compute_rank_projection(db=session, user_id=user_id)
        assert projection.rank == 1
        assert projection.breakdown.points_total == 1
        assert projection.breakdown.verified_captures_total == 1
        assert projection.breakdown.verified_captures_counted == 1
