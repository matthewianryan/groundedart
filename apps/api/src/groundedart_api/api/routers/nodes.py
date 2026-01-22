from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query
from geoalchemy2 import Geography
from sqlalchemy import cast, func, select

from groundedart_api.api.schemas import (
    CheckinChallengeResponse,
    CheckinRequest,
    CheckinResponse,
    NodePublic,
    NodesResponse,
)
from groundedart_api.auth.deps import CurrentUser, OptionalUser
from groundedart_api.auth.tokens import generate_opaque_token, hash_opaque_token
from groundedart_api.db.models import CheckinChallenge, CheckinToken, CuratorProfile, Node, utcnow
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.errors import AppError
from groundedart_api.settings import Settings, get_settings

router = APIRouter(prefix="/v1", tags=["nodes"])


@router.get("/nodes", response_model=NodesResponse)
async def list_nodes(
    db: DbSessionDep,
    user: OptionalUser,
    bbox: str | None = Query(default=None, description="minLng,minLat,maxLng,maxLat"),
) -> NodesResponse:
    rank = 0
    if user is not None:
        profile = await db.scalar(select(CuratorProfile).where(CuratorProfile.user_id == user.id))
        rank = profile.rank if profile else 0

    query = select(
        Node.id,
        Node.name,
        Node.description,
        Node.category,
        Node.radius_m,
        Node.min_rank,
        func.ST_Y(Node.location).label("lat"),
        func.ST_X(Node.location).label("lng"),
    ).where(Node.min_rank <= rank)
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
    return NodesResponse(
        nodes=[
            NodePublic(
                id=row.id,
                name=row.name,
                description=row.description,
                category=row.category,
                lat=float(row.lat),
                lng=float(row.lng),
                radius_m=row.radius_m,
                min_rank=row.min_rank,
            )
            for row in rows
        ]
    )


@router.post("/nodes/{node_id}/checkins/challenge", response_model=CheckinChallengeResponse)
async def create_checkin_challenge(
    node_id: uuid.UUID,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
) -> CheckinChallengeResponse:
    node = await db.get(Node, node_id)
    if node is None:
        raise AppError(code="node_not_found", message="Node not found", status_code=404)

    expires_at = utcnow() + dt.timedelta(seconds=settings.checkin_challenge_ttl_seconds)
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
) -> CheckinResponse:
    challenge = await db.get(CheckinChallenge, body.challenge_id)
    if challenge is None or challenge.user_id != user.id or challenge.node_id != node_id:
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
    if utcnow() >= challenge.expires_at:
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
        raise AppError(
            code="outside_geofence",
            message="You are not inside the node geofence",
            status_code=403,
        )

    challenge.used_at = utcnow()

    token = generate_opaque_token()
    token_hash = hash_opaque_token(token, settings)
    expires_at = utcnow() + dt.timedelta(seconds=settings.checkin_token_ttl_seconds)
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
