from __future__ import annotations

import datetime as dt
import uuid

import pytest
from geoalchemy2.elements import WKTElement
from httpx import AsyncClient
from sqlalchemy import select

from groundedart_api.db.models import Capture, ContentReport, Node, User
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.settings import get_settings


async def create_reportable_capture(db_sessionmaker) -> tuple[uuid.UUID, uuid.UUID]:
    node_id = uuid.uuid4()
    user_id = uuid.uuid4()
    capture_id = uuid.uuid4()
    async with db_sessionmaker() as session:
        session.add(User(id=user_id))
        session.add(
            Node(
                id=node_id,
                name="Reportable Node",
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
                user_id=user_id,
                node_id=node_id,
                state=CaptureState.verified.value,
                visibility="public",
                image_path="captures/reportable.jpg",
                image_mime="image/jpeg",
                attribution_artist_name="Reporter Artist",
                attribution_artwork_title="Reporter Title",
                attribution_source="Placard",
                rights_basis="i_took_photo",
                rights_attested_at=dt.datetime.now(dt.UTC),
            )
        )
        await session.commit()
    return node_id, capture_id


@pytest.mark.asyncio
async def test_reports_create_list_and_resolve(db_sessionmaker, client: AsyncClient) -> None:
    node_id, capture_id = await create_reportable_capture(db_sessionmaker)

    session_response = await client.post(
        "/v1/sessions/anonymous",
        json={"device_id": str(uuid.uuid4())},
    )
    assert session_response.status_code == 200

    report_response = await client.post(
        f"/v1/captures/{capture_id}/reports",
        json={"reason": "spam", "details": "Off-topic content"},
    )
    assert report_response.status_code == 200
    report_payload = report_response.json()["report"]
    report_id = uuid.UUID(report_payload["id"])

    settings = get_settings()
    admin_list = await client.get(
        "/v1/admin/reports",
        headers={"X-Admin-Token": settings.admin_api_token},
    )
    assert admin_list.status_code == 200
    report_ids = {report["id"] for report in admin_list.json()["reports"]}
    assert str(report_id) in report_ids

    resolve = await client.post(
        f"/v1/admin/reports/{report_id}/resolve",
        headers={"X-Admin-Token": settings.admin_api_token},
        json={"resolution": "hide_capture"},
    )
    assert resolve.status_code == 200
    resolved_payload = resolve.json()["report"]
    assert resolved_payload["resolution"] == "hide_capture"
    assert resolved_payload["resolved_at"] is not None

    after_hide = await client.get(f"/v1/nodes/{node_id}/captures")
    assert after_hide.status_code == 200
    assert after_hide.json()["captures"] == []

    async with db_sessionmaker() as session:
        report = await session.get(ContentReport, report_id)
        assert report is not None
        assert report.resolution == "hide_capture"
        assert report.resolved_at is not None

        capture = await session.get(Capture, capture_id)
        assert capture is not None
        assert capture.state == CaptureState.hidden.value
        assert capture.state_reason == "report_hide"
        report_in_db = await session.scalar(
            select(ContentReport).where(ContentReport.capture_id == capture_id)
        )
        assert report_in_db is not None
