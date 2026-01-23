from __future__ import annotations

import re

import pytest
from httpx import AsyncClient

_REQUEST_ID_RE = re.compile(r"^[A-Fa-f0-9-]{36}$")


@pytest.mark.asyncio
async def test_request_id_is_added_to_responses(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    request_id = response.headers.get("x-request-id")
    assert request_id
    assert _REQUEST_ID_RE.fullmatch(request_id)


@pytest.mark.asyncio
async def test_request_id_is_echoed_when_provided(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-ID": "test-request-123"})
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == "test-request-123"


@pytest.mark.asyncio
async def test_metrics_endpoint_exposed(client: AsyncClient) -> None:
    response = await client.get("/metrics")
    assert response.status_code == 200
    body = response.text
    assert "ga_operation_total" in body
    assert "ga_operation_duration_seconds" in body
    assert "ga_capture_transition_total" in body

