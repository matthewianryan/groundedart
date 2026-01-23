"""add tip receipts

Revision ID: 20260124_0016
Revises: 20260124_0015
Create Date: 2026-01-24

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "20260124_0016"
down_revision = "20260124_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tip_receipts",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("tip_intent_id", UUID(as_uuid=True), nullable=False),
        sa.Column("tx_signature", sa.String(length=128), nullable=False),
        sa.Column("from_pubkey", sa.String(length=64), nullable=True),
        sa.Column("to_pubkey", sa.String(length=64), nullable=False),
        sa.Column("amount_lamports", sa.Integer(), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=True),
        sa.Column("block_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmation_status", sa.String(length=16), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("failure_reason", sa.String(length=64), nullable=True),
        sa.CheckConstraint(
            "confirmation_status in ('seen', 'confirmed', 'finalized', 'failed')",
            name="ck_tip_receipts_confirmation_status",
        ),
        sa.ForeignKeyConstraint(
            ["tip_intent_id"], ["tip_intents.id"], name="fk_tip_receipts_tip_intent_id"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tip_intent_id", name="uq_tip_receipts_tip_intent_id"),
        sa.UniqueConstraint("tx_signature", name="uq_tip_receipts_tx_signature"),
    )
    op.create_index("ix_tip_receipts_confirmation_status", "tip_receipts", ["confirmation_status"])


def downgrade() -> None:
    op.drop_index("ix_tip_receipts_confirmation_status", table_name="tip_receipts")
    op.drop_table("tip_receipts")
