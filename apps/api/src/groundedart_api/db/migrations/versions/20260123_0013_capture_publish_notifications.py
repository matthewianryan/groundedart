"""add publish request + notifications

Revision ID: 20260123_0013
Revises: 20260123_0012
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "20260123_0013"
down_revision = "20260123_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "captures",
        sa.Column(
            "publish_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_check_constraint(
        "ck_captures_rights_basis",
        "captures",
        "rights_basis IS NULL OR rights_basis IN ('i_took_photo', 'permission_granted', 'public_domain')",
    )

    op.create_table(
        "user_notifications",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("details", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_notifications_user_created",
        "user_notifications",
        ["user_id", "created_at"],
    )

    op.alter_column(
        "captures",
        "publish_requested",
        existing_type=sa.Boolean(),
        server_default=None,
    )


def downgrade() -> None:
    op.drop_index("ix_user_notifications_user_created", table_name="user_notifications")
    op.drop_table("user_notifications")
    op.drop_constraint("ck_captures_rights_basis", "captures", type_="check")
    op.drop_column("captures", "publish_requested")
