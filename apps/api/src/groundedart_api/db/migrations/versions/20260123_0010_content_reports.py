"""add content reports table

Revision ID: 20260123_0010
Revises: 20260123_0009
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "20260123_0010"
down_revision = "20260123_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_reports",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("capture_id", UUID(as_uuid=True), nullable=False),
        sa.Column("node_id", UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["capture_id"], ["captures.id"]),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_content_reports_capture_created",
        "content_reports",
        ["capture_id", "created_at"],
    )
    op.create_index(
        "ix_content_reports_created_at",
        "content_reports",
        ["created_at"],
    )
    op.create_index(
        "ix_content_reports_resolved_at",
        "content_reports",
        ["resolved_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_content_reports_resolved_at", table_name="content_reports")
    op.drop_index("ix_content_reports_created_at", table_name="content_reports")
    op.drop_index("ix_content_reports_capture_created", table_name="content_reports")
    op.drop_table("content_reports")
