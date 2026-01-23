"""Add node image metadata.

Revision ID: 20260124_0018
Revises: 20260124_0017_seed_nodes_refresh
Create Date: 2026-01-24 00:32:00.000000
"""

from __future__ import annotations

import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "20260124_0018"
down_revision = "20260124_0017_seed_nodes_refresh"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("image_path", sa.Text(), nullable=True))
    op.add_column("nodes", sa.Column("image_attribution", sa.String(length=300), nullable=True))
    op.add_column("nodes", sa.Column("image_source_url", sa.String(length=500), nullable=True))
    op.add_column("nodes", sa.Column("image_license", sa.String(length=100), nullable=True))

    def _get_repo_root() -> Path:
        current = Path(__file__).resolve()
        for parent in current.parents:
            if (parent / ".git").exists():
                return parent
        raise RuntimeError("Could not locate repo root for seed data.")

    bind = op.get_bind()
    seed_path = _get_repo_root() / "data" / "seed" / "nodes.json"
    rows = json.loads(seed_path.read_text(encoding="utf-8"))

    stmt = sa.text(
        """
        UPDATE nodes
        SET image_path = :image_path,
            image_attribution = :image_attribution,
            image_source_url = :image_source_url,
            image_license = :image_license
        WHERE id = :id
        """
    )

    for row in rows:
        if not row.get("image_path"):
            continue
        bind.execute(
            stmt,
            {
                "id": row["id"],
                "image_path": row.get("image_path"),
                "image_attribution": row.get("image_attribution"),
                "image_source_url": row.get("image_source_url"),
                "image_license": row.get("image_license"),
            },
        )


def downgrade() -> None:
    op.drop_column("nodes", "image_license")
    op.drop_column("nodes", "image_source_url")
    op.drop_column("nodes", "image_attribution")
    op.drop_column("nodes", "image_path")
