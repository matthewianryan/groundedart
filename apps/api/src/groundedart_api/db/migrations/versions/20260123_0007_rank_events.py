"""add rank events table

Revision ID: 20260123_0007
Revises: 20260123_0006
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "20260123_0007"
down_revision = "20260123_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rank_events",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("rank_version", sa.String(length=32), nullable=False),
        sa.Column("capture_id", UUID(as_uuid=True), nullable=True),
        sa.Column("node_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("details", JSONB, nullable=True),
        sa.ForeignKeyConstraint(["capture_id"], ["captures.id"]),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_type",
            "capture_id",
            name="uq_rank_events_event_type_capture_id",
        ),
    )
    op.create_index("ix_rank_events_user_created", "rank_events", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_rank_events_user_created", table_name="rank_events")
    op.drop_table("rank_events")
