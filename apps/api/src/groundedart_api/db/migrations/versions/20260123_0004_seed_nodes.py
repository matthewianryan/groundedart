"""seed nodes

Revision ID: 20260123_0004
Revises: 20260123_0003
Create Date: 2026-01-23

"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260123_0004"
down_revision = "20260123_0003"
branch_labels = None
depends_on = None


def _get_repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / ".git").exists():
            return parent
    raise RuntimeError("Could not locate repo root for seed data.")


def _load_seed_nodes() -> list[dict[str, object]]:
    seed_path = _get_repo_root() / "data" / "seed" / "nodes.json"
    return json.loads(seed_path.read_text(encoding="utf-8"))


def upgrade() -> None:
    bind = op.get_bind()
    stmt = sa.text(
        """
        INSERT INTO nodes (
            id,
            name,
            description,
            category,
            location,
            radius_m,
            min_rank,
            created_at
        )
        VALUES (
            :id,
            :name,
            :description,
            :category,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
            :radius_m,
            :min_rank,
            NOW()
        )
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            location = EXCLUDED.location,
            radius_m = EXCLUDED.radius_m,
            min_rank = EXCLUDED.min_rank
        """
    )

    for row in _load_seed_nodes():
        bind.execute(
            stmt,
            {
                "id": uuid.UUID(str(row["id"])),
                "name": str(row["name"]),
                "description": row.get("description"),
                "category": str(row["category"]),
                "lat": float(row["lat"]),
                "lng": float(row["lng"]),
                "radius_m": int(row["radius_m"]),
                "min_rank": int(row["min_rank"]),
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    delete_stmt = sa.text("DELETE FROM nodes WHERE id = :id")
    for row in _load_seed_nodes():
        bind.execute(delete_stmt, {"id": uuid.UUID(str(row["id"]))})
