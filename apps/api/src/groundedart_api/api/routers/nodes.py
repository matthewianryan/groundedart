from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, Query
from geoalchemy2 import Geography
from sqlalchemy import cast, func, select

from groundedart_api.api.routers.captures import capture_to_public
import logging

from groundedart_api.api.schemas import (
    CapturesResponse,
    CheckinChallengeResponse,
    CheckinRequest,
    CheckinResponse,
    NodePublic,
    NodesResponse,
)
from groundedart_api.auth.deps import CurrentUser, OptionalUser
from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import Capture, CheckinChallenge, CheckinToken, CuratorProfile, Node
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.abuse_events import record_abuse_event
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.errors import AppError
from groundedart_api.settings import Settings, get_settings
from groundedart_api.time import UtcNow, get_utcnow

router = APIRouter(prefix="/v1", tags=["nodes"])
logger = logging.getLogger(__name__)


def _node_select_with_coords():
    return select(
        Node.id,
        Node.name,
        Node.description,
        Node.category,
        Node.radius_m,
        Node.min_rank,
        func.ST_Y(Node.location).label("lat"),
        func.ST_X(Node.location).label("lng"),
    )


async def _get_user_rank(db: DbSessionDep, user: OptionalUser) -> int:
    if user is None:
        return 0

    profile = await db.scalar(select(CuratorProfile).where(CuratorProfile.user_id == user.id))
    return profile.rank if profile else 0


def _row_to_node_public(row: Any) -> NodePublic:
    return NodePublic(
        id=row.id,
        name=row.name,
        description=row.description,
        category=row.category,
        lat=float(row.lat),
        lng=float(row.lng),
        radius_m=row.radius_m,
        min_rank=row.min_rank,
    )


@router.get("/nodes", response_model=NodesResponse)
async def list_nodes(
    db: DbSessionDep,
    user: OptionalUser,
    bbox: str | None = Query(default=None, description="minLng,minLat,maxLng,maxLat"),
) -> NodesResponse:
    rank = await _get_user_rank(db, user)

    query = _node_select_with_coords().where(Node.min_rank <= rank)
    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = (float(x) for x in bbox.split(","))
        except Exception as exc:  # noqa: BLE001
            raise AppError(
                code="invalid_bbox",
                message="Invalid bbox format",
                details={"bbox": bbox},
            ) from exc
        envelope = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
        query = query.where(func.ST_Intersects(Node.location, envelope))

    rows = (await db.execute(query.limit(500))).all()
    return NodesResponse(nodes=[_row_to_node_public(row) for row in rows])


@router.get("/nodes/{node_id}", response_model=NodePublic)
async def get_node(
    node_id: uuid.UUID,
    db: DbSessionDep,
    user: OptionalUser,
) -> NodePublic:
    rank = await _get_user_rank(db, user)
    query = _node_select_with_coords().where(Node.id == node_id, Node.min_rank <= rank)
    row = (await db.execute(query)).one_or_none()
    if row is None:
        raise AppError(code="node_not_found", message="Node not found", status_code=404)
    return _row_to_node_public(row)


@router.get("/nodes/{node_id}/captures", response_model=CapturesResponse)
async def list_node_captures(
    node_id: uuid.UUID,
    db: DbSessionDep,
    user: OptionalUser,
    state: CaptureState = Query(default=CaptureState.verified),
    admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    settings: Settings = Depends(get_settings),
) -> CapturesResponse:
    if state != CaptureState.verified and admin_token != settings.admin_api_token:
        raise AppError(
            code="admin_auth_required",
            message="Admin authentication required",
            status_code=401,
        )

    rank = await _get_user_rank(db, user)
    node_query = _node_select_with_coords().where(Node.id == node_id, Node.min_rank <= rank)
    node_row = (await db.execute(node_query)).one_or_none()
    if node_row is None:
        raise AppError(code="node_not_found", message="Node not found", status_code=404)

    captures = (
        await db.scalars(
            select(Capture)
            .where(Capture.node_id == node_id, Capture.state == state.value)
            .order_by(Capture.created_at.desc())
        )
    ).all()
    return CapturesResponse(captures=[capture_to_public(capture) for capture in captures])


@router.post("/nodes/{node_id}/checkins/challenge", response_model=CheckinChallengeResponse)
async def create_checkin_challenge(
    node_id: uuid.UUID,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
    now: UtcNow = Depends(get_utcnow),
) -> CheckinChallengeResponse:
    now_time = now()
    node = await db.get(Node, node_id)
    if node is None:
        raise AppError(code="node_not_found", message="Node not found", status_code=404)

    window_start = now_time - dt.timedelta(seconds=settings.checkin_challenge_rate_window_seconds)
    recent_challenges = await db.scalar(
        select(func.count())
        .select_from(CheckinChallenge)
        .where(
            CheckinChallenge.user_id == user.id,
            CheckinChallenge.node_id == node.id,
            CheckinChallenge.created_at >= window_start,
        )
    )
    if (recent_challenges or 0) >= settings.max_checkin_challenges_per_user_node_per_window:
        await record_abuse_event(
            db=db,
            event_type="checkin_challenge_rate_limited",
            user_id=user.id,
            node_id=node.id,
            details={
                "max_per_window": settings.max_checkin_challenges_per_user_node_per_window,
                "window_seconds": settings.checkin_challenge_rate_window_seconds,
                "recent_count": int(recent_challenges or 0),
            },
        )
        raise AppError(
            code="checkin_challenge_rate_limited",
            message="Check-in challenge rate limit exceeded",
            status_code=429,
            details={
                "max_per_window": settings.max_checkin_challenges_per_user_node_per_window,
                "window_seconds": settings.checkin_challenge_rate_window_seconds,
            },
        )

    expires_at = now_time + dt.timedelta(seconds=settings.checkin_challenge_ttl_seconds)
    challenge = CheckinChallenge(user_id=user.id, node_id=node.id, expires_at=expires_at)
    db.add(challenge)
    await db.commit()
    return CheckinChallengeResponse(challenge_id=challenge.id, expires_at=challenge.expires_at)


@router.post("/nodes/{node_id}/checkins", response_model=CheckinResponse)
async def check_in(
    node_id: uuid.UUID,
    body: CheckinRequest,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
    now: UtcNow = Depends(get_utcnow),
) -> CheckinResponse:
    now_time = now()
    challenge = await db.get(CheckinChallenge, body.challenge_id)
    if challenge is None or challenge.user_id != user.id or challenge.node_id != node_id:
        logger.warning(
            "Invalid check-in challenge",
            extra={
                "challenge_id": str(body.challenge_id),
                "node_id": str(node_id),
                "user_id": str(user.id),
            },
        )
        await record_abuse_event(
            db=db,
            event_type="invalid_challenge",
            user_id=user.id,
            node_id=None,
            details={
                "challenge_id": str(body.challenge_id),
                "node_id": str(node_id),
            },
        )
        raise AppError(
            code="invalid_challenge",
            message="Invalid check-in challenge",
            status_code=400,
        )
    if challenge.used_at is not None:
        raise AppError(
            code="challenge_used",
            message="Check-in challenge already used",
            status_code=400,
        )
    if now_time >= challenge.expires_at:
        raise AppError(
            code="challenge_expired",
            message="Check-in challenge expired",
            status_code=400,
        )
    if body.accuracy_m > settings.max_location_accuracy_m:
        raise AppError(
            code="location_accuracy_too_low",
            message="Location accuracy too low",
            status_code=400,
            details={
                "accuracy_m": body.accuracy_m,
                "max_allowed_m": settings.max_location_accuracy_m,
            },
        )

    node = await db.get(Node, node_id)
    if node is None:
        raise AppError(code="node_not_found", message="Node not found", status_code=404)

    point = func.ST_SetSRID(func.ST_MakePoint(body.lng, body.lat), 4326)
    within = await db.scalar(
        select(
            func.ST_DWithin(
                cast(Node.location, Geography),
                cast(point, Geography),
                Node.radius_m,
            )
        ).where(Node.id == node.id)
    )
    if not within:
        distance_m = await db.scalar(
            select(
                func.ST_Distance(
                    cast(Node.location, Geography),
                    cast(point, Geography),
                )
            ).where(Node.id == node.id)
        )
        details = {"radius_m": node.radius_m}
        if distance_m is not None:
            details["distance_m"] = float(distance_m)
        details["lat"] = body.lat
        details["lng"] = body.lng
        details["accuracy_m"] = body.accuracy_m
        await record_abuse_event(
            db=db,
            event_type="outside_geofence",
            user_id=user.id,
            node_id=node.id,
            details=details,
        )
        raise AppError(
            code="outside_geofence",
            message="You are not inside the node geofence",
            status_code=403,
            details=details,
        )

    window_start = now_time - dt.timedelta(seconds=settings.capture_rate_window_seconds)
    recent_captures = await db.scalar(
        select(func.count())
        .select_from(Capture)
        .where(
            Capture.user_id == user.id,
            Capture.node_id == node.id,
            Capture.created_at >= window_start,
        )
    )
    if (recent_captures or 0) >= settings.max_captures_per_user_node_per_day:
        await record_abuse_event(
            db=db,
            event_type="capture_rate_limited",
            user_id=user.id,
            node_id=node.id,
            details={
                "source": "checkin",
                "max_per_window": settings.max_captures_per_user_node_per_day,
                "window_seconds": settings.capture_rate_window_seconds,
                "recent_count": int(recent_captures or 0),
            },
        )
        raise AppError(
            code="capture_rate_limited",
            message="Capture rate limit exceeded",
            status_code=429,
            details={
                "max_per_window": settings.max_captures_per_user_node_per_day,
                "window_seconds": settings.capture_rate_window_seconds,
            },
        )

    challenge.used_at = now_time

    token = generate_opaque_token()
    token_hash = hash_opaque_token(token, settings)
    expires_at = now_time + dt.timedelta(seconds=settings.checkin_token_ttl_seconds)
    db.add(
        CheckinToken(
            user_id=user.id,
            node_id=node.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )
    await db.commit()

    return CheckinResponse(checkin_token=token, expires_at=expires_at)
