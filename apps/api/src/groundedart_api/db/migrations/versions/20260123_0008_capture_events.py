"""rename capture_state_events to capture_events and add event_type

Revision ID: 20260123_0008
Revises: 20260123_0007
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260123_0008"
down_revision = "20260123_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("capture_state_events", "capture_events")
    op.add_column(
        "capture_events",
        sa.Column(
            "event_type",
            sa.String(length=64),
            nullable=False,
            server_default="state_transition",
        ),
    )
    op.alter_column(
        "capture_events",
        "from_state",
        existing_type=sa.String(length=32),
        nullable=True,
    )
    op.alter_column(
        "capture_events",
        "to_state",
        existing_type=sa.String(length=32),
        nullable=True,
    )
    op.drop_index("ix_capture_state_events_capture_created", table_name="capture_events")
    op.create_index(
        "ix_capture_events_capture_created",
        "capture_events",
        ["capture_id", "created_at"],
    )
    op.alter_column("capture_events", "event_type", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_capture_events_capture_created", table_name="capture_events")
    op.create_index(
        "ix_capture_state_events_capture_created",
        "capture_events",
        ["capture_id", "created_at"],
    )
    op.execute(
        "UPDATE capture_events "
        "SET from_state = COALESCE(from_state, to_state, 'draft'), "
        "to_state = COALESCE(to_state, from_state, 'draft')"
    )
    op.alter_column(
        "capture_events",
        "from_state",
        existing_type=sa.String(length=32),
        nullable=False,
    )
    op.alter_column(
        "capture_events",
        "to_state",
        existing_type=sa.String(length=32),
        nullable=False,
    )
    op.drop_column("capture_events", "event_type")
    op.rename_table("capture_events", "capture_state_events")
