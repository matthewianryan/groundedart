from __future__ import annotations

import datetime as dt
from pathlib import Path
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient
from sqlalchemy import select

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import Capture, CaptureStateEvent, CheckinToken, Node, utcnow
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.capture_state_events import apply_capture_transition_with_audit
from groundedart_api.settings import get_settings

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def load_fixture_bytes(name: str) -> bytes:
    return (FIXTURES_DIR / name).read_bytes()


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
                name="Audit Node",
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


async def create_capture(db_sessionmaker, client: AsyncClient) -> tuple[uuid.UUID, uuid.UUID]:
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
    response = await client.post(
        "/v1/captures",
        json={"node_id": str(node_id), "checkin_token": token},
    )
    assert response.status_code == 200
    return uuid.UUID(response.json()["capture"]["id"]), user_id


@pytest.mark.asyncio
async def test_upload_promotion_creates_audit_event(db_sessionmaker, client: AsyncClient) -> None:
    capture_id, user_id = await create_capture(db_sessionmaker, client)
    fixture_bytes = load_fixture_bytes("tiny.png")

    response = await client.post(
        f"/v1/captures/{capture_id}/image",
        files={"file": ("tiny.png", fixture_bytes, "image/png")},
    )

    assert response.status_code == 200
    async with db_sessionmaker() as session:
        result = await session.execute(
            select(CaptureStateEvent)
            .where(CaptureStateEvent.capture_id == capture_id)
            .order_by(CaptureStateEvent.created_at)
        )
        events = list(result.scalars())

    assert len(events) == 1
    event = events[0]
    assert event.from_state == CaptureState.draft.value
    assert event.to_state == CaptureState.pending_verification.value
    assert event.reason_code == "image_uploaded"
    assert event.actor_type == "user"
    assert event.actor_user_id == user_id


@pytest.mark.asyncio
async def test_admin_transition_creates_audit_event(db_sessionmaker, client: AsyncClient) -> None:
    capture_id, user_id = await create_capture(db_sessionmaker, client)
    fixture_bytes = load_fixture_bytes("tiny.png")

    response = await client.post(
        f"/v1/captures/{capture_id}/image",
        files={"file": ("tiny.png", fixture_bytes, "image/png")},
    )

    assert response.status_code == 200
    async with db_sessionmaker() as session:
        capture = await session.get(Capture, capture_id)
        assert capture is not None
        apply_capture_transition_with_audit(
            db=session,
            capture=capture,
            target_state=CaptureState.verified,
            reason_code="image_uploaded",
            actor_type="admin",
            actor_user_id=user_id,
            details={"source": "manual_review"},
        )
        await session.commit()

        result = await session.execute(
            select(CaptureStateEvent)
            .where(CaptureStateEvent.capture_id == capture_id)
            .order_by(CaptureStateEvent.created_at)
        )
        events = list(result.scalars())

    assert len(events) == 2
    event = events[-1]
    assert event.from_state == CaptureState.pending_verification.value
    assert event.to_state == CaptureState.verified.value
    assert event.reason_code == "image_uploaded"
    assert event.actor_type == "admin"
    assert event.actor_user_id == user_id
    assert event.details == {"source": "manual_review"}
