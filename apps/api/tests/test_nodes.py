from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import CuratorProfile, Node, Session, User
from groundedart_api.settings import get_settings


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
        session.add(CuratorProfile(user_id=user.id, rank=rank))
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
