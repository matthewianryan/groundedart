"""add capture state events table

Revision ID: 20260123_0005
Revises: 20260123_0004
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "20260123_0005"
down_revision = "20260123_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "capture_state_events",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("capture_id", UUID(as_uuid=True), nullable=False),
        sa.Column("from_state", sa.String(length=32), nullable=False),
        sa.Column("to_state", sa.String(length=32), nullable=False),
        sa.Column("reason_code", sa.String(length=100), nullable=True),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("details", JSONB, nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["capture_id"], ["captures.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_capture_state_events_capture_created",
        "capture_state_events",
        ["capture_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_capture_state_events_capture_created", table_name="capture_state_events")
    op.drop_table("capture_state_events")
