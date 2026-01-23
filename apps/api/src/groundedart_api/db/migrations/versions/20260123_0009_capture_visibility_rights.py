"""add capture visibility and rights fields

Revision ID: 20260123_0009
Revises: 20260123_0008
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260123_0009"
down_revision = "20260123_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "captures",
        sa.Column(
            "visibility",
            sa.String(length=16),
            nullable=False,
            server_default="private",
        ),
    )
    op.add_column(
        "captures",
        sa.Column("rights_basis", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "captures",
        sa.Column("rights_attested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "captures",
        sa.Column("attribution_source", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "captures",
        sa.Column("attribution_source_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("captures", "attribution_source_url")
    op.drop_column("captures", "attribution_source")
    op.drop_column("captures", "rights_attested_at")
    op.drop_column("captures", "rights_basis")
    op.drop_column("captures", "visibility")
