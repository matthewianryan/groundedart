"""add deterministic id to rank events

Revision ID: 20260123_0012
Revises: 20260123_0011
Create Date: 2026-01-23

"""

from __future__ import annotations

import hashlib
import json
import uuid

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260123_0012"
down_revision = "20260123_0011"
branch_labels = None
depends_on = None


def _normalize(value: str) -> str:
    return value.strip().lower()


def _compute_deterministic_id(
    *,
    event_type: str,
    rank_version: str,
    user_id: uuid.UUID,
    capture_id: uuid.UUID,
) -> str:
    identity: dict[str, object] = {
        "v": 1,
        "event_type": _normalize(event_type),
        "rank_version": _normalize(rank_version),
        "user_id": str(user_id).lower(),
        "source_kind": "capture",
        "source_id": str(capture_id).lower(),
    }
    payload = json.dumps(identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    return hashlib.sha256(payload).hexdigest()


def upgrade() -> None:
    op.add_column("rank_events", sa.Column("deterministic_id", sa.String(length=64), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, user_id, event_type, rank_version, capture_id FROM rank_events"
        )
    ).fetchall()

    updates: list[dict[str, object]] = []
    for row in rows:
        if row.capture_id is None:
            raise RuntimeError(
                f"Cannot backfill rank_events.deterministic_id without capture_id (rank_event id={row.id})."
            )
        deterministic_id = _compute_deterministic_id(
            event_type=row.event_type,
            rank_version=row.rank_version,
            user_id=row.user_id,
            capture_id=row.capture_id,
        )
        updates.append({"id": row.id, "deterministic_id": deterministic_id})

    if updates:
        conn.execute(
            sa.text("UPDATE rank_events SET deterministic_id = :deterministic_id WHERE id = :id"),
            updates,
        )

    op.alter_column("rank_events", "deterministic_id", existing_type=sa.String(length=64), nullable=False)
    op.create_unique_constraint(
        "uq_rank_events_deterministic_id",
        "rank_events",
        ["deterministic_id"],
    )
    op.drop_constraint(
        "uq_rank_events_event_type_capture_id",
        "rank_events",
        type_="unique",
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_rank_events_event_type_capture_id",
        "rank_events",
        ["event_type", "capture_id"],
    )
    op.drop_constraint("uq_rank_events_deterministic_id", "rank_events", type_="unique")
    op.drop_column("rank_events", "deterministic_id")

