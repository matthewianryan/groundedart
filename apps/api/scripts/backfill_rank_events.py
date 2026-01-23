from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from groundedart_api.db.models import Capture, CaptureEvent, CuratorRankEvent
from groundedart_api.db.session import create_sessionmaker
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.rank_events import DEFAULT_RANK_VERSION
from groundedart_api.domain.rank_projection import CAPTURE_VERIFIED_EVENT_TYPE
from groundedart_api.settings import get_settings


async def main() -> None:
    settings = get_settings()
    sessionmaker = create_sessionmaker(settings.database_url)

    verified_at_subq = (
        select(
            CaptureEvent.capture_id.label("capture_id"),
            func.max(CaptureEvent.created_at).label("verified_at"),
        )
        .where(CaptureEvent.to_state == CaptureState.verified.value)
        .group_by(CaptureEvent.capture_id)
        .subquery()
    )

    query = (
        select(
            Capture.id,
            Capture.user_id,
            Capture.node_id,
            func.coalesce(verified_at_subq.c.verified_at, Capture.created_at).label(
                "verified_at"
            ),
        )
        .outerjoin(verified_at_subq, verified_at_subq.c.capture_id == Capture.id)
        .where(Capture.state == CaptureState.verified.value)
    )

    async with sessionmaker() as db:
        rows = (await db.execute(query)).all()
        if not rows:
            print("No verified captures found; nothing to backfill.")
            return

        values = []
        for row in rows:
            values.append(
                {
                    "id": uuid.uuid4(),
                    "user_id": row.user_id,
                    "event_type": CAPTURE_VERIFIED_EVENT_TYPE,
                    "delta": 1,
                    "rank_version": DEFAULT_RANK_VERSION,
                    "capture_id": row.id,
                    "node_id": row.node_id,
                    "created_at": row.verified_at,
                    "details": {"source": "backfill"},
                }
            )

        insert_stmt = (
            insert(CuratorRankEvent)
            .values(values)
            .on_conflict_do_nothing(constraint="uq_rank_events_event_type_capture_id")
            .returning(CuratorRankEvent.id)
        )
        result = await db.execute(insert_stmt)
        inserted = len(result.fetchall())
        await db.commit()

        print(
            f"Backfill complete: {inserted} inserted, {len(values) - inserted} skipped."
        )


if __name__ == "__main__":
    asyncio.run(main())
