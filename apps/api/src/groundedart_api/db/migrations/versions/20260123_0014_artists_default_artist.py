"""add artists and node default artist

Revision ID: 20260123_0014
Revises: 20260123_0013
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "20260123_0014"
down_revision = "20260123_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artists",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("solana_recipient_pubkey", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "solana_recipient_pubkey ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'",
            name="ck_artists_solana_pubkey",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("nodes", sa.Column("default_artist_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_nodes_default_artist",
        "nodes",
        "artists",
        ["default_artist_id"],
        ["id"],
    )
    op.create_index("ix_nodes_default_artist_id", "nodes", ["default_artist_id"])


def downgrade() -> None:
    op.drop_index("ix_nodes_default_artist_id", table_name="nodes")
    op.drop_constraint("fk_nodes_default_artist", "nodes", type_="foreignkey")
    op.drop_column("nodes", "default_artist_id")
    op.drop_table("artists")
