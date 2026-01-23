from __future__ import annotations

import datetime as dt
from pathlib import Path
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import ASGITransport, AsyncClient

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import CheckinToken, Node, utcnow
from groundedart_api.domain.verification_events import get_verification_event_emitter
from groundedart_api.main import create_app
from groundedart_api.settings import get_settings

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def load_fixture_bytes(name: str) -> bytes:
    return (FIXTURES_DIR / name).read_bytes()


class RecordingEmitter:
    def __init__(self) -> None:
        self.uploaded: list[tuple[uuid.UUID, uuid.UUID, uuid.UUID]] = []
        self.state_changed: list[tuple[uuid.UUID, str, str, str | None]] = []

    async def capture_uploaded(
        self,
        capture_id: uuid.UUID,
        node_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        self.uploaded.append((capture_id, node_id, user_id))

    async def capture_state_changed(
        self,
        capture_id: uuid.UUID,
        from_state: str,
        to_state: str,
        reason_code: str | None,
    ) -> None:
        self.state_changed.append((capture_id, from_state, to_state, reason_code))


def make_client_with_emitter(emitter: RecordingEmitter) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_verification_event_emitter] = lambda: emitter
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


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
                name="Event Node",
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
            )
        )
        await session.commit()


async def create_capture(
    db_sessionmaker,
    client: AsyncClient,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
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
    capture_id = uuid.UUID(response.json()["capture"]["id"])
    return capture_id, node_id, user_id


async def create_pending_capture(
    db_sessionmaker,
    client: AsyncClient,
) -> uuid.UUID:
    capture_id, _, _ = await create_capture(db_sessionmaker, client)
    fixture_bytes = load_fixture_bytes("tiny.png")
    upload_response = await client.post(
        f"/v1/captures/{capture_id}/image",
        files={"file": ("tiny.png", fixture_bytes, "image/png")},
    )
    assert upload_response.status_code == 200
    return capture_id


@pytest.mark.asyncio
async def test_upload_promotion_emits_capture_uploaded_event(db_sessionmaker) -> None:
    emitter = RecordingEmitter()
    async with make_client_with_emitter(emitter) as client:
        capture_id, node_id, user_id = await create_capture(db_sessionmaker, client)
        fixture_bytes = load_fixture_bytes("tiny.png")

        response = await client.post(
            f"/v1/captures/{capture_id}/image",
            files={"file": ("tiny.png", fixture_bytes, "image/png")},
        )

    assert response.status_code == 200
    assert emitter.uploaded == [(capture_id, node_id, user_id)]


@pytest.mark.asyncio
async def test_admin_transition_emits_capture_state_changed_event(db_sessionmaker) -> None:
    emitter = RecordingEmitter()
    settings = get_settings()

    async with make_client_with_emitter(emitter) as client:
        capture_id = await create_pending_capture(db_sessionmaker, client)
        response = await client.post(
            f"/v1/admin/captures/{capture_id}/transition",
            headers={"X-Admin-Token": settings.admin_api_token},
            json={"target_state": "verified", "reason_code": "manual_review_pass"},
        )

    assert response.status_code == 200
    assert emitter.state_changed == [
        (
            capture_id,
            "pending_verification",
            "verified",
            "manual_review_pass",
        )
    ]
