from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import CheckinChallenge, CheckinToken, Node, utcnow
from groundedart_api.settings import get_settings


def _load_error_codes() -> set[str]:
    schemas_dir = Path(__file__).resolve().parents[3] / "packages" / "domain" / "schemas"
    codes: set[str] = set()
    for path in schemas_dir.glob("*_error_code.json"):
        payload = json.loads(path.read_text())
        codes.update(payload.get("enum", []))
    return codes


@pytest.fixture(scope="session")
def error_codes() -> set[str]:
    return _load_error_codes()


def _assert_error_code(response, error_codes: set[str], expected: str) -> None:
    payload = response.json()
    code = payload["error"]["code"]
    assert code == expected
    assert code in error_codes


async def _create_session(client: AsyncClient) -> uuid.UUID:
    response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": str(uuid.uuid4())},
    )
    assert response.status_code == 200
    return uuid.UUID(response.json()["user_id"])


async def _create_node(db_sessionmaker) -> uuid.UUID:
    node_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(
            Node(
                id=node_id,
                name="Error Contract Node",
                category="mural",
                description=None,
                location=WKTElement("POINT(-122.40 37.78)", srid=4326),
                radius_m=25,
                min_rank=0,
            )
        )
        await session.commit()
    return node_id


async def _insert_checkin_token(
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


@pytest.mark.asyncio
async def test_error_contracts_nodes_and_auth(client: AsyncClient, error_codes: set[str]) -> None:
    invalid_bbox = await client.get("/v1/nodes", params={"bbox": "not,a,bbox"})
    assert invalid_bbox.status_code == 400
    _assert_error_code(invalid_bbox, error_codes, "invalid_bbox")

    missing_node = await client.get(f"/v1/nodes/{uuid.uuid4()}")
    assert missing_node.status_code == 404
    _assert_error_code(missing_node, error_codes, "node_not_found")

    missing_auth = await client.get("/v1/me")
    assert missing_auth.status_code == 401
    _assert_error_code(missing_auth, error_codes, "auth_required")


@pytest.mark.asyncio
async def test_error_contracts_checkins(
    db_sessionmaker,
    client: AsyncClient,
    error_codes: set[str],
) -> None:
    node_id = await _create_node(db_sessionmaker)
    user_id = await _create_session(client)

    invalid = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": str(uuid.uuid4()),
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": 10,
        },
    )
    assert invalid.status_code == 400
    _assert_error_code(invalid, error_codes, "invalid_challenge")

    expired_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(
            CheckinChallenge(
                id=expired_id,
                user_id=user_id,
                node_id=node_id,
                expires_at=utcnow() - dt.timedelta(seconds=1),
            )
        )
        await session.commit()
    expired = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": str(expired_id),
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": 10,
        },
    )
    assert expired.status_code == 400
    _assert_error_code(expired, error_codes, "challenge_expired")

    used_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(
            CheckinChallenge(
                id=used_id,
                user_id=user_id,
                node_id=node_id,
                expires_at=utcnow() + dt.timedelta(seconds=30),
                used_at=utcnow(),
            )
        )
        await session.commit()
    used = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": str(used_id),
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": 10,
        },
    )
    assert used.status_code == 400
    _assert_error_code(used, error_codes, "challenge_used")

    settings = get_settings()
    challenge = await client.post(f"/v1/nodes/{node_id}/checkins/challenge")
    assert challenge.status_code == 200
    accuracy = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": challenge.json()["challenge_id"],
            "lat": 37.78,
            "lng": -122.40,
            "accuracy_m": settings.max_location_accuracy_m + 1,
        },
    )
    assert accuracy.status_code == 400
    _assert_error_code(accuracy, error_codes, "location_accuracy_too_low")

    challenge_far = await client.post(f"/v1/nodes/{node_id}/checkins/challenge")
    assert challenge_far.status_code == 200
    outside = await client.post(
        f"/v1/nodes/{node_id}/checkins",
        json={
            "challenge_id": challenge_far.json()["challenge_id"],
            "lat": 0.0,
            "lng": 0.0,
            "accuracy_m": 10,
        },
    )
    assert outside.status_code == 403
    _assert_error_code(outside, error_codes, "outside_geofence")


@pytest.mark.asyncio
async def test_error_contracts_captures(
    db_sessionmaker,
    client: AsyncClient,
    error_codes: set[str],
) -> None:
    node_id = await _create_node(db_sessionmaker)
    user_id = await _create_session(client)

    invalid = await client.post(
        "/v1/captures",
        json={
            "node_id": str(node_id),
            "checkin_token": "not-a-real-token",
        },
    )
    assert invalid.status_code == 400
    _assert_error_code(invalid, error_codes, "invalid_checkin_token")

    expired_token = generate_opaque_token()
    await _insert_checkin_token(
        db_sessionmaker,
        user_id=user_id,
        node_id=node_id,
        token=expired_token,
        expires_at=utcnow() - dt.timedelta(seconds=1),
    )
    expired = await client.post(
        "/v1/captures",
        json={
            "node_id": str(node_id),
            "checkin_token": expired_token,
        },
    )
    assert expired.status_code == 400
    _assert_error_code(expired, error_codes, "checkin_token_expired")

    valid_token = generate_opaque_token()
    await _insert_checkin_token(
        db_sessionmaker,
        user_id=user_id,
        node_id=node_id,
        token=valid_token,
        expires_at=utcnow() + dt.timedelta(seconds=30),
    )
    created = await client.post(
        "/v1/captures",
        json={
            "node_id": str(node_id),
            "checkin_token": valid_token,
        },
    )
    assert created.status_code == 200
    capture_id = uuid.UUID(created.json()["capture"]["id"])

    invalid_media = await client.post(
        f"/v1/captures/{capture_id}/image",
        files={"file": ("note.txt", b"not an image", "text/plain")},
    )
    assert invalid_media.status_code == 415
    _assert_error_code(invalid_media, error_codes, "invalid_media_type")

    missing_capture = await client.get(f"/v1/captures/{uuid.uuid4()}")
    assert missing_capture.status_code == 404
    _assert_error_code(missing_capture, error_codes, "capture_not_found")

    await _create_session(client)
    forbidden = await client.get(f"/v1/captures/{capture_id}")
    assert forbidden.status_code == 403
    _assert_error_code(forbidden, error_codes, "forbidden")
