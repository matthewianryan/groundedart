"""add check-in lookup indexes

Revision ID: 20260123_0003
Revises: 20260123_0002
Create Date: 2026-01-23

"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260123_0003"
down_revision = "20260123_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_checkin_challenges_user_node_expires",
        "checkin_challenges",
        ["user_id", "node_id", "expires_at"],
    )
    op.create_index(
        "ix_checkin_tokens_user_node_expires",
        "checkin_tokens",
        ["user_id", "node_id", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_checkin_tokens_user_node_expires", table_name="checkin_tokens")
    op.drop_index("ix_checkin_challenges_user_node_expires", table_name="checkin_challenges")
