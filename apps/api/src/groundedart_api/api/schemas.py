from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"


class AnonymousSessionRequest(BaseModel):
    device_id: uuid.UUID


class AnonymousSessionResponse(BaseModel):
    user_id: uuid.UUID
    session_expires_at: dt.datetime


class RankBreakdownCaps(BaseModel):
    per_node_per_day: int = 0
    per_day_total: int = 0


class RankBreakdown(BaseModel):
    points_total: int = 0
    verified_captures_total: int = 0
    verified_captures_counted: int = 0
    caps_applied: RankBreakdownCaps


class NextUnlock(BaseModel):
    min_rank: int
    summary: str
    unlocks: list[str]


class MeResponse(BaseModel):
    user_id: uuid.UUID
    rank: int = 0
    rank_version: str
    rank_breakdown: RankBreakdown
    next_unlock: NextUnlock | None = None


class RankEvent(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    event_type: str
    delta: int
    created_at: dt.datetime
    rank_version: str
    capture_id: uuid.UUID | None = None
    node_id: uuid.UUID | None = None
    details: dict[str, object] | None = None


class RankEventsResponse(BaseModel):
    events: list[RankEvent]


class NodePublic(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    category: str
    lat: float
    lng: float
    radius_m: int = Field(ge=25)
    min_rank: int


class NodesResponse(BaseModel):
    nodes: list[NodePublic]


class CheckinChallengeResponse(BaseModel):
    challenge_id: uuid.UUID
    expires_at: dt.datetime


class CheckinRequest(BaseModel):
    challenge_id: uuid.UUID
    lat: float
    lng: float
    accuracy_m: float = Field(ge=0)


class CheckinResponse(BaseModel):
    checkin_token: str
    expires_at: dt.datetime


class CreateCaptureRequest(BaseModel):
    node_id: uuid.UUID
    checkin_token: str
    attribution_artist_name: str | None = None
    attribution_artwork_title: str | None = None
    attribution_source: str | None = None
    attribution_source_url: str | None = None
    rights_basis: str | None = None
    rights_attestation: bool | None = None


class UpdateCaptureRequest(BaseModel):
    attribution_artist_name: str | None = None
    attribution_artwork_title: str | None = None
    attribution_source: str | None = None
    attribution_source_url: str | None = None
    rights_basis: str | None = None
    rights_attestation: bool | None = None


class CapturePublic(BaseModel):
    id: uuid.UUID
    node_id: uuid.UUID
    state: str
    visibility: str
    created_at: dt.datetime
    image_url: str | None = None
    attribution_artist_name: str | None = None
    attribution_artwork_title: str | None = None
    attribution_source: str | None = None
    attribution_source_url: str | None = None
    rights_basis: str | None = None
    rights_attested_at: dt.datetime | None = None


class CreateCaptureResponse(BaseModel):
    capture: CapturePublic


class CapturesResponse(BaseModel):
    captures: list[CapturePublic]


class AdminCapture(BaseModel):
    id: uuid.UUID
    node_id: uuid.UUID
    user_id: uuid.UUID
    state: str
    visibility: str
    state_reason: str | None = None
    created_at: dt.datetime
    image_url: str | None = None
    attribution_artist_name: str | None = None
    attribution_artwork_title: str | None = None
    attribution_source: str | None = None
    attribution_source_url: str | None = None
    rights_basis: str | None = None
    rights_attested_at: dt.datetime | None = None


class AdminCapturesResponse(BaseModel):
    captures: list[AdminCapture]


class AdminCaptureTransitionRequest(BaseModel):
    target_state: str
    reason_code: str | None = None
    details: dict[str, object] | None = None


class AdminCaptureTransitionResponse(BaseModel):
    capture: AdminCapture


class AdminAbuseEvent(BaseModel):
    id: uuid.UUID
    event_type: str
    user_id: uuid.UUID | None = None
    node_id: uuid.UUID | None = None
    capture_id: uuid.UUID | None = None
    created_at: dt.datetime
    details: dict[str, object] | None = None


class AdminAbuseEventsResponse(BaseModel):
    events: list[AdminAbuseEvent]
