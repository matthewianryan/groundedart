from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Date, cast, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import Capture, CuratorRankCache, CuratorRankDaily, CuratorRankEvent, utcnow
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.rank_constants import PER_DAY_POINTS_CAP
from groundedart_api.domain.rank_events import CAPTURE_VERIFIED_EVENT_TYPE, DEFAULT_RANK_VERSION


def _utc_date(value: dt.datetime) -> dt.date:
    if value.tzinfo is None:
        return value.date()
    return value.astimezone(dt.timezone.utc).date()


def _event_utc_day_expr():
    return cast(func.timezone("UTC", CuratorRankEvent.created_at), Date)


def _event_source_key_expr():
    return func.coalesce(CuratorRankEvent.node_id, CuratorRankEvent.capture_id, CuratorRankEvent.id)


async def materialize_rank_for_user(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    rank_version: str = DEFAULT_RANK_VERSION,
) -> CuratorRankCache:
    await db.execute(
        delete(CuratorRankDaily).where(
            CuratorRankDaily.user_id == user_id,
            CuratorRankDaily.rank_version == rank_version,
        )
    )

    day_expr = _event_utc_day_expr().label("day")
    source_key_expr = _event_source_key_expr()
    query = (
        select(
            day_expr,
            func.count().label("total"),
            func.count(func.distinct(source_key_expr)).label("unique_sources"),
        )
        .select_from(CuratorRankEvent)
        .join(Capture, CuratorRankEvent.capture_id == Capture.id)
        .where(
            CuratorRankEvent.user_id == user_id,
            CuratorRankEvent.rank_version == rank_version,
            CuratorRankEvent.event_type == CAPTURE_VERIFIED_EVENT_TYPE,
            Capture.state == CaptureState.verified.value,
        )
        .group_by(day_expr)
        .order_by(day_expr.asc())
    )
    rows = (await db.execute(query)).all()

    totals = {
        "points_total": 0,
        "verified_captures_total": 0,
        "verified_captures_counted": 0,
        "per_node_per_day_removed": 0,
        "per_day_removed": 0,
    }
    now = utcnow()
    if rows:
        daily_values: list[dict[str, object]] = []
        for row in rows:
            total = int(row.total or 0)
            unique_sources = int(row.unique_sources or 0)
            points = min(unique_sources, PER_DAY_POINTS_CAP)
            per_node_removed = max(total - unique_sources, 0)
            per_day_removed = max(unique_sources - points, 0)
            daily_values.append(
                {
                    "user_id": user_id,
                    "rank_version": rank_version,
                    "day": row.day,
                    "verified_captures_total": total,
                    "verified_captures_unique": unique_sources,
                    "points_counted": points,
                    "per_node_per_day_removed": per_node_removed,
                    "per_day_removed": per_day_removed,
                    "updated_at": now,
                }
            )
            totals["points_total"] += points
            totals["verified_captures_total"] += total
            totals["verified_captures_counted"] += points
            totals["per_node_per_day_removed"] += per_node_removed
            totals["per_day_removed"] += per_day_removed

        await db.execute(insert(CuratorRankDaily).values(daily_values))

    cache_stmt = (
        insert(CuratorRankCache)
        .values(
            user_id=user_id,
            rank_version=rank_version,
            points_total=totals["points_total"],
            verified_captures_total=totals["verified_captures_total"],
            verified_captures_counted=totals["verified_captures_counted"],
            per_node_per_day_removed=totals["per_node_per_day_removed"],
            per_day_removed=totals["per_day_removed"],
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[CuratorRankCache.user_id],
            set_={
                "rank_version": rank_version,
                "points_total": totals["points_total"],
                "verified_captures_total": totals["verified_captures_total"],
                "verified_captures_counted": totals["verified_captures_counted"],
                "per_node_per_day_removed": totals["per_node_per_day_removed"],
                "per_day_removed": totals["per_day_removed"],
                "updated_at": now,
            },
        )
        .returning(CuratorRankCache.user_id)
    )
    await db.execute(cache_stmt)
    cache = await db.get(CuratorRankCache, user_id)
    if cache is None:
        raise RuntimeError("Failed to materialize curator rank cache.")
    return cache


async def compute_rank_totals_from_events(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    rank_version: str = DEFAULT_RANK_VERSION,
) -> dict[str, int]:
    day_expr = _event_utc_day_expr().label("day")
    source_key_expr = _event_source_key_expr()
    query = (
        select(
            day_expr,
            func.count().label("total"),
            func.count(func.distinct(source_key_expr)).label("unique_sources"),
        )
        .select_from(CuratorRankEvent)
        .join(Capture, CuratorRankEvent.capture_id == Capture.id)
        .where(
            CuratorRankEvent.user_id == user_id,
            CuratorRankEvent.rank_version == rank_version,
            CuratorRankEvent.event_type == CAPTURE_VERIFIED_EVENT_TYPE,
            Capture.state == CaptureState.verified.value,
        )
        .group_by(day_expr)
    )
    rows = (await db.execute(query)).all()

    totals = {
        "points_total": 0,
        "verified_captures_total": 0,
        "verified_captures_counted": 0,
        "per_node_per_day_removed": 0,
        "per_day_removed": 0,
    }
    for row in rows:
        total = int(row.total or 0)
        unique_sources = int(row.unique_sources or 0)
        points = min(unique_sources, PER_DAY_POINTS_CAP)
        per_node_removed = max(total - unique_sources, 0)
        per_day_removed = max(unique_sources - points, 0)
        totals["points_total"] += points
        totals["verified_captures_total"] += total
        totals["verified_captures_counted"] += points
        totals["per_node_per_day_removed"] += per_node_removed
        totals["per_day_removed"] += per_day_removed
    return totals


async def refresh_rank_for_user_day(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    day: dt.date,
    rank_version: str = DEFAULT_RANK_VERSION,
) -> CuratorRankCache:
    existing_cache = await db.get(CuratorRankCache, user_id)
    if existing_cache is None or existing_cache.rank_version != rank_version:
        return await materialize_rank_for_user(db=db, user_id=user_id, rank_version=rank_version)

    existing_daily = await db.get(
        CuratorRankDaily,
        {
            "user_id": user_id,
            "rank_version": rank_version,
            "day": day,
        },
    )
    old_total = int(existing_daily.verified_captures_total) if existing_daily else 0
    old_unique = int(existing_daily.verified_captures_unique) if existing_daily else 0
    old_points = int(existing_daily.points_counted) if existing_daily else 0
    old_node_removed = int(existing_daily.per_node_per_day_removed) if existing_daily else 0
    old_day_removed = int(existing_daily.per_day_removed) if existing_daily else 0

    day_expr = _event_utc_day_expr()
    source_key_expr = _event_source_key_expr()
    row = (
        await db.execute(
            select(
                func.count().label("total"),
                func.count(func.distinct(source_key_expr)).label("unique_sources"),
            )
            .select_from(CuratorRankEvent)
            .join(Capture, CuratorRankEvent.capture_id == Capture.id)
            .where(
                CuratorRankEvent.user_id == user_id,
                CuratorRankEvent.rank_version == rank_version,
                CuratorRankEvent.event_type == CAPTURE_VERIFIED_EVENT_TYPE,
                Capture.state == CaptureState.verified.value,
                day_expr == day,
            )
        )
    ).one()

    total = int(row.total or 0)
    unique_sources = int(row.unique_sources or 0)
    points = min(unique_sources, PER_DAY_POINTS_CAP)
    per_node_removed = max(total - unique_sources, 0)
    per_day_removed = max(unique_sources - points, 0)
    now = utcnow()

    if total == 0:
        if existing_daily is not None:
            await db.delete(existing_daily)
    else:
        stmt = (
            insert(CuratorRankDaily)
            .values(
                user_id=user_id,
                rank_version=rank_version,
                day=day,
                verified_captures_total=total,
                verified_captures_unique=unique_sources,
                points_counted=points,
                per_node_per_day_removed=per_node_removed,
                per_day_removed=per_day_removed,
                updated_at=now,
            )
            .on_conflict_do_update(
                constraint="uq_curator_rank_daily_user_version_day",
                set_={
                    "verified_captures_total": total,
                    "verified_captures_unique": unique_sources,
                    "points_counted": points,
                    "per_node_per_day_removed": per_node_removed,
                    "per_day_removed": per_day_removed,
                    "updated_at": now,
                },
            )
        )
        await db.execute(stmt)

    points_total = existing_cache.points_total + (points - old_points)
    verified_total = existing_cache.verified_captures_total + (total - old_total)
    counted_total = existing_cache.verified_captures_counted + (points - old_points)
    node_removed_total = existing_cache.per_node_per_day_removed + (per_node_removed - old_node_removed)
    day_removed_total = existing_cache.per_day_removed + (per_day_removed - old_day_removed)

    cache_update = (
        insert(CuratorRankCache)
        .values(
            user_id=user_id,
            rank_version=rank_version,
            points_total=points_total,
            verified_captures_total=verified_total,
            verified_captures_counted=counted_total,
            per_node_per_day_removed=node_removed_total,
            per_day_removed=day_removed_total,
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[CuratorRankCache.user_id],
            set_={
                "rank_version": rank_version,
                "points_total": points_total,
                "verified_captures_total": verified_total,
                "verified_captures_counted": counted_total,
                "per_node_per_day_removed": node_removed_total,
                "per_day_removed": day_removed_total,
                "updated_at": now,
            },
        )
    )
    await db.execute(cache_update)
    cache = await db.get(CuratorRankCache, user_id)
    if cache is None:
        raise RuntimeError("Failed to update curator rank cache.")
    return cache


async def get_capture_verified_event_day(
    *,
    db: AsyncSession,
    capture_id: uuid.UUID,
    rank_version: str = DEFAULT_RANK_VERSION,
) -> dt.date | None:
    row = await db.execute(
        select(CuratorRankEvent.created_at)
        .where(
            CuratorRankEvent.capture_id == capture_id,
            CuratorRankEvent.rank_version == rank_version,
            CuratorRankEvent.event_type == CAPTURE_VERIFIED_EVENT_TYPE,
        )
        .order_by(CuratorRankEvent.created_at.asc(), CuratorRankEvent.id.asc())
        .limit(1)
    )
    created_at = row.scalar_one_or_none()
    if created_at is None:
        return None
    return _utc_date(created_at)
