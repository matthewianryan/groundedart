"""enforce minimum node radius

Revision ID: 20260123_0002
Revises: 20260122_0001
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260123_0002"
down_revision = "20260122_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_nodes_radius_m_min_25",
        "nodes",
        "radius_m >= 25",
    )


def downgrade() -> None:
    op.drop_constraint("ck_nodes_radius_m_min_25", "nodes", type_="check")
