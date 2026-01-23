from __future__ import annotations

import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient
from sqlalchemy import select

from groundedart_api.db.models import Capture, CaptureEvent, Node
from groundedart_api.domain.capture_state import CaptureState


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
                name="Publish Node",
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
async def test_publish_requires_verified_capture(db_sessionmaker, client: AsyncClient) -> None:
    node_id = await create_node(db_sessionmaker)
    user_id = await create_session(client)
    capture_id = uuid.uuid4()

    async with db_sessionmaker() as session:
        session.add(
            Capture(
                id=capture_id,
                user_id=user_id,
                node_id=node_id,
                state=CaptureState.pending_verification.value,
                visibility="private",
            )
        )
        await session.commit()

    response = await client.post(f"/v1/captures/{capture_id}/publish")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "capture_not_verified"


@pytest.mark.asyncio
async def test_publish_validates_requirements_and_sets_visibility(
    db_sessionmaker,
    client: AsyncClient,
) -> None:
    node_id = await create_node(db_sessionmaker)
    user_id = await create_session(client)
    capture_id = uuid.uuid4()

    async with db_sessionmaker() as session:
        session.add(
            Capture(
                id=capture_id,
                user_id=user_id,
                node_id=node_id,
                state=CaptureState.verified.value,
                visibility="private",
            )
        )
        await session.commit()

    before_publish = await client.get(f"/v1/nodes/{node_id}/captures")
    assert before_publish.status_code == 200
    assert before_publish.json()["captures"] == []

    missing_attribution = await client.post(f"/v1/captures/{capture_id}/publish")
    assert missing_attribution.status_code == 400
    payload = missing_attribution.json()
    assert payload["error"]["code"] == "capture_missing_attribution"
    assert "attribution_artist_name" in payload["error"]["details"]["missing_fields"]

    updated = await client.patch(
        f"/v1/captures/{capture_id}",
        json={
            "attribution_artist_name": "Ada Lovelace",
            "attribution_artwork_title": "Analytical Engine",
            "attribution_source": "On-site placard",
        },
    )
    assert updated.status_code == 200

    missing_rights = await client.post(f"/v1/captures/{capture_id}/publish")
    assert missing_rights.status_code == 400
    payload = missing_rights.json()
    assert payload["error"]["code"] == "capture_missing_rights"
    assert "rights_basis" in payload["error"]["details"]["missing_fields"]

    updated_rights = await client.patch(
        f"/v1/captures/{capture_id}",
        json={"rights_basis": "i_took_photo", "rights_attestation": True},
    )
    assert updated_rights.status_code == 200
    assert updated_rights.json()["rights_attested_at"] is not None

    published = await client.post(f"/v1/captures/{capture_id}/publish")
    assert published.status_code == 200
    payload = published.json()
    assert payload["visibility"] == "public"

    after_publish = await client.get(f"/v1/nodes/{node_id}/captures")
    assert after_publish.status_code == 200
    capture_ids = [capture["id"] for capture in after_publish.json()["captures"]]
    assert capture_ids == [str(capture_id)]

    async with db_sessionmaker() as session:
        events = await session.scalars(
            select(CaptureEvent).where(
                CaptureEvent.capture_id == capture_id,
                CaptureEvent.event_type == "capture_published",
            )
        )
        assert events.first() is not None
