from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from groundedart_api.api.schemas import (
    MeResponse,
    NextUnlock,
    NotificationPublic,
    NotificationsResponse,
    RankBreakdown,
    RankBreakdownCaps,
)
from groundedart_api.auth.deps import CurrentUser
from groundedart_api.db.models import UserNotification
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.errors import AppError
from groundedart_api.domain.rank_projection import compute_rank_projection
from groundedart_api.time import UtcNow, get_utcnow

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me", response_model=MeResponse)
async def me(db: DbSessionDep, user: CurrentUser) -> MeResponse:
    projection = await compute_rank_projection(db=db, user_id=user.id)
    breakdown = RankBreakdown(
        points_total=projection.breakdown.points_total,
        verified_captures_total=projection.breakdown.verified_captures_total,
        verified_captures_counted=projection.breakdown.verified_captures_counted,
        caps_applied=RankBreakdownCaps(
            per_node_per_day=projection.breakdown.caps_applied.per_node_per_day,
            per_day_total=projection.breakdown.caps_applied.per_day_total,
        ),
    )
    next_unlock = None
    if projection.next_unlock is not None:
        next_unlock = NextUnlock(
            min_rank=projection.next_unlock.min_rank,
            summary=projection.next_unlock.summary,
            unlocks=projection.next_unlock.unlocks,
        )
    return MeResponse(
        user_id=user.id,
        rank=projection.rank,
        rank_version=projection.rank_version,
        rank_breakdown=breakdown,
        next_unlock=next_unlock,
    )


def notification_to_public(notification: UserNotification) -> NotificationPublic:
    return NotificationPublic(
        id=notification.id,
        event_type=notification.event_type,
        title=notification.title,
        body=notification.body,
        created_at=notification.created_at,
        read_at=notification.read_at,
        details=notification.details,
    )


@router.get("/me/notifications", response_model=NotificationsResponse)
async def list_notifications(
    db: DbSessionDep,
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
    unread_only: bool = Query(default=False),
) -> NotificationsResponse:
    query = select(UserNotification).where(UserNotification.user_id == user.id)
    if unread_only:
        query = query.where(UserNotification.read_at.is_(None))
    notifications = (
        await db.scalars(query.order_by(UserNotification.created_at.desc()).limit(limit))
    ).all()
    return NotificationsResponse(
        notifications=[notification_to_public(notification) for notification in notifications]
    )


@router.post("/me/notifications/{notification_id}/read", response_model=NotificationPublic)
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: DbSessionDep,
    user: CurrentUser,
    now: UtcNow = Depends(get_utcnow),
) -> NotificationPublic:
    notification = await db.get(UserNotification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise AppError(
            code="notification_not_found",
            message="Notification not found",
            status_code=404,
        )
    if notification.read_at is None:
        notification.read_at = now()
        await db.commit()
        await db.refresh(notification)
    return notification_to_public(notification)
