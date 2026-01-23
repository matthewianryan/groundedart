from __future__ import annotations

import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient

from groundedart_api.db.models import Capture, Node, User
from groundedart_api.domain.capture_state import CaptureState


@pytest.mark.asyncio
async def test_list_nodes_filters_by_bbox(db_sessionmaker, client: AsyncClient):
    inside_id = uuid.uuid4()
    outside_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add_all(
            [
                Node(
                    id=inside_id,
                    name="Inside",
                    category="mural",
                    description=None,
                    location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                    radius_m=25,
                    min_rank=0,
                ),
                Node(
                    id=outside_id,
                    name="Outside",
                    category="mural",
                    description=None,
                    location=WKTElement("POINT(-73.98 40.75)", srid=4326),
                    radius_m=25,
                    min_rank=0,
                ),
            ]
        )
        await session.commit()

    bbox = "-123,37.6,-122,38.0"
    response = await client.get("/v1/nodes", params={"bbox": bbox})
    assert response.status_code == 200
    payload = response.json()
    node_ids = {node["id"] for node in payload["nodes"]}
    assert str(inside_id) in node_ids
    assert str(outside_id) not in node_ids


@pytest.mark.asyncio
async def test_node_detail_and_verified_captures(db_sessionmaker, client: AsyncClient):
    node_id = uuid.uuid4()
    user_id = uuid.uuid4()
    verified_capture_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(User(id=user_id))
        session.add(
            Node(
                id=node_id,
                name="Detail Node",
                category="sculpture",
                description="Test node",
                location=WKTElement("POINT(12.49 41.89)", srid=4326),
                radius_m=30,
                min_rank=0,
            )
        )
        await session.flush()
        session.add_all(
            [
                Capture(
                    id=verified_capture_id,
                    user_id=user_id,
                    node_id=node_id,
                    state=CaptureState.verified.value,
                    image_path="captures/verified.jpg",
                    image_mime="image/jpeg",
                ),
                Capture(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    node_id=node_id,
                    state=CaptureState.pending_verification.value,
                    image_path="captures/pending.jpg",
                    image_mime="image/jpeg",
                ),
            ]
        )
        await session.commit()

    detail = await client.get(f"/v1/nodes/{node_id}")
    assert detail.status_code == 200
    node = detail.json()
    assert node["id"] == str(node_id)
    assert node["name"] == "Detail Node"
    assert pytest.approx(node["lat"], rel=1e-3) == 41.89
    assert pytest.approx(node["lng"], rel=1e-3) == 12.49

    captures = await client.get(f"/v1/nodes/{node_id}/captures", params={"state": "verified"})
    assert captures.status_code == 200
    data = captures.json()
    capture_ids = [capture["id"] for capture in data["captures"]]
    assert capture_ids == [str(verified_capture_id)]
    assert data["captures"][0]["image_url"] == "/media/captures/verified.jpg"
