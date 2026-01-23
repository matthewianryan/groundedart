"""add tip intents

Revision ID: 20260124_0015
Revises: 20260123_0014
Create Date: 2026-01-24

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "20260124_0015"
down_revision = "20260123_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tip_intents",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("node_id", UUID(as_uuid=True), nullable=False),
        sa.Column("artist_id", UUID(as_uuid=True), nullable=False),
        sa.Column("amount_lamports", sa.Integer(), nullable=False),
        sa.Column("to_pubkey", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.CheckConstraint(
            "status in ('open', 'expired', 'completed', 'canceled')",
            name="ck_tip_intents_status",
        ),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], name="fk_tip_intents_node_id"),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], name="fk_tip_intents_artist_id"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_tip_intents_created_by_user_id",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tip_intents_node_id", "tip_intents", ["node_id"])
    op.create_index("ix_tip_intents_artist_id", "tip_intents", ["artist_id"])
    op.create_index("ix_tip_intents_created_by_user_id", "tip_intents", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_tip_intents_created_by_user_id", table_name="tip_intents")
    op.drop_index("ix_tip_intents_artist_id", table_name="tip_intents")
    op.drop_index("ix_tip_intents_node_id", table_name="tip_intents")
    op.drop_table("tip_intents")
