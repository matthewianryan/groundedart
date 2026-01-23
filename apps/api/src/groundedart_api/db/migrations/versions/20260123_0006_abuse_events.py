"""add abuse events table

Revision ID: 20260123_0006
Revises: 20260123_0005
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "20260123_0006"
down_revision = "20260123_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abuse_events",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("node_id", UUID(as_uuid=True), nullable=True),
        sa.Column("capture_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("details", JSONB, nullable=True),
        sa.ForeignKeyConstraint(["capture_id"], ["captures.id"]),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_abuse_events_created_at", "abuse_events", ["created_at"])
    op.create_index(
        "ix_abuse_events_user_node_created",
        "abuse_events",
        ["user_id", "node_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_abuse_events_user_node_created", table_name="abuse_events")
    op.drop_index("ix_abuse_events_created_at", table_name="abuse_events")
    op.drop_table("abuse_events")
