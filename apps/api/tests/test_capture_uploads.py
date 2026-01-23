from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import ASGITransport, AsyncClient

from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import CheckinToken, Node, utcnow
from groundedart_api.main import create_app
from groundedart_api.settings import get_settings


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    yield
    get_settings.cache_clear()


def make_client(monkeypatch, media_dir, *, allowed_types: list[str], max_bytes: int) -> AsyncClient:
    monkeypatch.setenv("MEDIA_DIR", str(media_dir))
    quoted = ",".join(f"\"{mime}\"" for mime in allowed_types)
    monkeypatch.setenv("UPLOAD_ALLOWED_MIME_TYPES", f"[{quoted}]")
    monkeypatch.setenv("UPLOAD_MAX_BYTES", str(max_bytes))
    get_settings.cache_clear()
    app = create_app()
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
                name="Upload Node",
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


async def create_capture(db_sessionmaker, client: AsyncClient) -> uuid.UUID:
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
    return uuid.UUID(response.json()["capture"]["id"])


@pytest.mark.asyncio
async def test_upload_rejects_invalid_media_type(db_sessionmaker, monkeypatch, tmp_path) -> None:
    async with make_client(
        monkeypatch,
        tmp_path,
        allowed_types=["image/jpeg"],
        max_bytes=1_000,
    ) as client:
        capture_id = await create_capture(db_sessionmaker, client)
        response = await client.post(
            f"/v1/captures/{capture_id}/image",
            files={"file": ("note.txt", b"hello", "text/plain")},
        )

    assert response.status_code == 415
    payload = response.json()
    assert payload["error"]["code"] == "invalid_media_type"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_upload_rejects_too_large_file(db_sessionmaker, monkeypatch, tmp_path) -> None:
    async with make_client(
        monkeypatch,
        tmp_path,
        allowed_types=["image/jpeg"],
        max_bytes=4,
    ) as client:
        capture_id = await create_capture(db_sessionmaker, client)
        response = await client.post(
            f"/v1/captures/{capture_id}/image",
            files={"file": ("photo.jpg", b"12345", "image/jpeg")},
        )

    assert response.status_code == 413
    payload = response.json()
    assert payload["error"]["code"] == "file_too_large"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_upload_is_idempotent_overwrite(db_sessionmaker, monkeypatch, tmp_path) -> None:
    async with make_client(
        monkeypatch,
        tmp_path,
        allowed_types=["image/jpeg"],
        max_bytes=1_000,
    ) as client:
        capture_id = await create_capture(db_sessionmaker, client)
        first = await client.post(
            f"/v1/captures/{capture_id}/image",
            files={"file": ("photo.jpg", b"first", "image/jpeg")},
        )
        assert first.status_code == 200
        first_url = first.json()["image_url"]

        second = await client.post(
            f"/v1/captures/{capture_id}/image",
            files={"file": ("photo.jpg", b"second", "image/jpeg")},
        )

    assert second.status_code == 200
    second_url = second.json()["image_url"]
    assert second_url == first_url
    media_path = tmp_path / second_url.split("/media/")[1]
    assert media_path.read_bytes() == b"second"
