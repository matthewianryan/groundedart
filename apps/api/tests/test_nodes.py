from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import Capture, CuratorRankEvent, Node, Session, User
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.settings import get_settings


def _rank_event_timestamp(base_time: dt.datetime, index: int) -> dt.datetime:
    day_offset = index // 3
    minute_offset = index % 3
    return base_time + dt.timedelta(days=day_offset, minutes=minute_offset)


async def create_user_session(
    db_sessionmaker,
    *,
    expires_at: dt.datetime,
    rank: int = 0,
) -> tuple[uuid.UUID, str]:
    settings = get_settings()
    token = generate_opaque_token()
    token_hash = hash_opaque_token(token, settings)
    async with db_sessionmaker() as session:
        user = User()
        session.add(user)
        await session.flush()
        if rank > 0:
            now = dt.datetime.now(dt.UTC)
            for idx in range(rank):
                node_id = uuid.uuid4()
                capture_id = uuid.uuid4()
                session.add(
                    Node(
                        id=node_id,
                        name=f"Rank Node {idx}",
                        category="mural",
                        description=None,
                        location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                        radius_m=25,
                        min_rank=0,
                    )
                )
                await session.flush()
                session.add(
                    Capture(
                        id=capture_id,
                        user_id=user.id,
                        node_id=node_id,
                        state=CaptureState.verified.value,
                        image_path=f"captures/rank/{idx}.jpg",
                        image_mime="image/jpeg",
                    )
                )
                session.add(
                    CuratorRankEvent(
                        id=uuid.uuid4(),
                        user_id=user.id,
                        event_type="capture_verified",
                        delta=1,
                        rank_version="v1_points",
                        capture_id=capture_id,
                        node_id=node_id,
                        created_at=_rank_event_timestamp(now, idx),
                        details={"source": "test_seed"},
                    )
                )
        session.add(Session(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
        await session.commit()
    return user.id, token


async def create_ranked_nodes(db_sessionmaker) -> tuple[uuid.UUID, uuid.UUID]:
    public_id = uuid.uuid4()
    restricted_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add_all(
            [
                Node(
                    id=public_id,
                    name="Public Node",
                    category="mural",
                    description=None,
                    location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                    radius_m=25,
                    min_rank=0,
                ),
                Node(
                    id=restricted_id,
                    name="Restricted Node",
                    category="mural",
                    description=None,
                    location=WKTElement("POINT(-122.41 37.79)", srid=4326),
                    radius_m=25,
                    min_rank=2,
                ),
            ]
        )
        await session.commit()
    return public_id, restricted_id


async def create_node_with_captures(db_sessionmaker) -> tuple[uuid.UUID, uuid.UUID]:
    node_id = uuid.uuid4()
    user_id = uuid.uuid4()
    verified_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(User(id=user_id))
        session.add(
            Node(
                id=node_id,
                name="Capture Node",
                category="mural",
                description=None,
                location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                radius_m=25,
                min_rank=0,
            )
        )
        await session.flush()
        session.add_all(
            [
                Capture(
                    id=verified_id,
                    user_id=user_id,
                    node_id=node_id,
                    state=CaptureState.verified.value,
                    image_path="captures/verified.jpg",
                    image_mime="image/jpeg",
                    visibility="public",
                    attribution_artist_name="Test Artist",
                    attribution_artwork_title="Test Title",
                    attribution_source="Test Source",
                    rights_basis="i_took_photo",
                    rights_attested_at=dt.datetime.now(dt.UTC),
                ),
                Capture(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    node_id=node_id,
                    state=CaptureState.pending_verification.value,
                    image_path="captures/pending.jpg",
                    image_mime="image/jpeg",
                ),
                Capture(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    node_id=node_id,
                    state=CaptureState.rejected.value,
                    image_path="captures/rejected.jpg",
                    image_mime="image/jpeg",
                ),
                Capture(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    node_id=node_id,
                    state=CaptureState.hidden.value,
                    image_path="captures/hidden.jpg",
                    image_mime="image/jpeg",
                ),
            ]
        )
        await session.commit()
    return node_id, verified_id


@pytest.mark.asyncio
async def test_nodes_invalid_bbox_returns_error_details(client: AsyncClient) -> None:
    response = await client.get("/v1/nodes", params={"bbox": "not,a,bbox"})
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "invalid_bbox"
    assert payload["error"]["details"]["bbox"] == "not,a,bbox"


@pytest.mark.asyncio
async def test_node_detail_returns_not_found_for_missing_node(client: AsyncClient) -> None:
    missing_id = uuid.uuid4()
    response = await client.get(f"/v1/nodes/{missing_id}")
    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == "node_not_found"


@pytest.mark.asyncio
async def test_nodes_rank_filtering_for_list_and_detail(
    db_sessionmaker,
    client: AsyncClient,
) -> None:
    public_id, restricted_id = await create_ranked_nodes(db_sessionmaker)

    anonymous_list = await client.get("/v1/nodes")
    assert anonymous_list.status_code == 200
    anonymous_ids = {node["id"] for node in anonymous_list.json()["nodes"]}
    assert str(public_id) in anonymous_ids
    assert str(restricted_id) not in anonymous_ids

    anonymous_detail = await client.get(f"/v1/nodes/{restricted_id}")
    assert anonymous_detail.status_code == 404
    assert anonymous_detail.json()["error"]["code"] == "node_not_found"

    settings = get_settings()
    _, token = await create_user_session(
        db_sessionmaker,
        expires_at=dt.datetime.now(dt.UTC) + dt.timedelta(hours=1),
        rank=2,
    )
    client.cookies.set(settings.session_cookie_name, token)

    authed_list = await client.get("/v1/nodes")
    assert authed_list.status_code == 200
    authed_ids = {node["id"] for node in authed_list.json()["nodes"]}
    assert str(public_id) in authed_ids
    assert str(restricted_id) in authed_ids

    authed_detail = await client.get(f"/v1/nodes/{restricted_id}")
    assert authed_detail.status_code == 200
    assert authed_detail.json()["id"] == str(restricted_id)


@pytest.mark.asyncio
async def test_node_captures_rejects_non_verified_state_for_non_admin(
    db_sessionmaker,
    client: AsyncClient,
) -> None:
    node_id, _ = await create_node_with_captures(db_sessionmaker)
    non_admin_states = ["hidden", "rejected", "pending_verification"]

    for state in non_admin_states:
        response = await client.get(f"/v1/nodes/{node_id}/captures", params={"state": state})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "admin_auth_required"

    settings = get_settings()
    _, token = await create_user_session(
        db_sessionmaker,
        expires_at=dt.datetime.now(dt.UTC) + dt.timedelta(hours=1),
        rank=0,
    )
    client.cookies.set(settings.session_cookie_name, token)

    for state in non_admin_states:
        response = await client.get(f"/v1/nodes/{node_id}/captures", params={"state": state})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "admin_auth_required"


@pytest.mark.asyncio
async def test_node_captures_returns_only_verified_for_non_admin(
    db_sessionmaker,
    client: AsyncClient,
) -> None:
    node_id, verified_id = await create_node_with_captures(db_sessionmaker)

    response = await client.get(f"/v1/nodes/{node_id}/captures")
    assert response.status_code == 200
    payload = response.json()
    capture_ids = [capture["id"] for capture in payload["captures"]]
    assert capture_ids == [str(verified_id)]
