from __future__ import annotations

import datetime as dt
from pathlib import Path
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient
from sqlalchemy import select

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import Capture, CheckinToken, Node, UserNotification, utcnow
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
                name="Notification Node",
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


async def create_pending_capture(
    db_sessionmaker,
    client: AsyncClient,
    *,
    publish_requested: bool,
    include_rights: bool,
) -> uuid.UUID:
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
    payload = {
        "node_id": str(node_id),
        "checkin_token": token,
        "attribution_artist_name": "Ada Lovelace",
        "attribution_artwork_title": "Analytical Engine",
        "attribution_source": "Placard",
        "publish_requested": publish_requested,
    }
    if include_rights:
        payload.update({"rights_basis": "i_took_photo", "rights_attestation": True})

    capture_response = await client.post("/v1/captures", json=payload)
    assert capture_response.status_code == 200
    capture_id = uuid.UUID(capture_response.json()["capture"]["id"])

    fixture_bytes = load_fixture_bytes("tiny.png")
    upload_response = await client.post(
        f"/v1/captures/{capture_id}/image",
        files={"file": ("tiny.png", fixture_bytes, "image/png")},
    )
    assert upload_response.status_code == 200
    return capture_id


@pytest.mark.asyncio
async def test_verification_auto_publishes_and_notifies(db_sessionmaker, client: AsyncClient) -> None:
    capture_id = await create_pending_capture(
        db_sessionmaker,
        client,
        publish_requested=True,
        include_rights=True,
    )
    settings = get_settings()
    response = await client.post(
        f"/v1/admin/captures/{capture_id}/transition",
        headers={"X-Admin-Token": settings.admin_api_token},
        json={"target_state": "verified", "reason_code": "manual_review_pass"},
    )
    assert response.status_code == 200

    async with db_sessionmaker() as session:
        capture = await session.get(Capture, capture_id)
        assert capture is not None
        assert capture.visibility == "public"

        notification = await session.scalar(
            select(UserNotification)
            .where(UserNotification.user_id == capture.user_id)
            .order_by(UserNotification.created_at.desc())
            .limit(1)
        )
        assert notification is not None
        assert notification.event_type == "capture_verified"
        assert notification.details["published"] is True
        assert notification.details["missing_fields"] == []

    notifications_response = await client.get("/v1/me/notifications")
    assert notifications_response.status_code == 200
    payload = notifications_response.json()
    assert payload["notifications"]
    assert payload["notifications"][0]["event_type"] == "capture_verified"


@pytest.mark.asyncio
async def test_verification_notifies_missing_requirements(db_sessionmaker, client: AsyncClient) -> None:
    capture_id = await create_pending_capture(
        db_sessionmaker,
        client,
        publish_requested=True,
        include_rights=False,
    )
    settings = get_settings()
    response = await client.post(
        f"/v1/admin/captures/{capture_id}/transition",
        headers={"X-Admin-Token": settings.admin_api_token},
        json={"target_state": "verified", "reason_code": "manual_review_pass"},
    )
    assert response.status_code == 200

    async with db_sessionmaker() as session:
        capture = await session.get(Capture, capture_id)
        assert capture is not None
        assert capture.visibility == "private"

        notification = await session.scalar(
            select(UserNotification)
            .where(UserNotification.user_id == capture.user_id)
            .order_by(UserNotification.created_at.desc())
            .limit(1)
        )
        assert notification is not None
        missing_fields = notification.details["missing_fields"]
        assert "rights_basis" in missing_fields
        assert "rights_attested_at" in missing_fields
