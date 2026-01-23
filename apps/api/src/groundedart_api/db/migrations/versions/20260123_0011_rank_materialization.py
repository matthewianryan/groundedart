"""materialize rank + remove curator profile rank

Revision ID: 20260123_0011
Revises: 20260123_0010
Create Date: 2026-01-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "20260123_0011"
down_revision = "20260123_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("curator_profiles")

    op.create_table(
        "curator_rank_daily",
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rank_version", sa.String(length=32), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("verified_captures_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("verified_captures_unique", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("points_counted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("per_node_per_day_removed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("per_day_removed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id", "rank_version", "day"),
        sa.UniqueConstraint(
            "user_id",
            "rank_version",
            "day",
            name="uq_curator_rank_daily_user_version_day",
        ),
    )
    op.create_index("ix_curator_rank_daily_user_day", "curator_rank_daily", ["user_id", "day"])

    op.create_table(
        "curator_rank_cache",
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rank_version", sa.String(length=32), nullable=False, server_default="v1_points"),
        sa.Column("points_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("verified_captures_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("verified_captures_counted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("per_node_per_day_removed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("per_day_removed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.execute(
        """
        INSERT INTO curator_rank_daily (
            user_id,
            rank_version,
            day,
            verified_captures_total,
            verified_captures_unique,
            points_counted,
            per_node_per_day_removed,
            per_day_removed,
            updated_at
        )
        SELECT
            s.user_id,
            s.rank_version,
            s.day,
            s.verified_captures_total,
            s.verified_captures_unique,
            LEAST(s.verified_captures_unique, 3) AS points_counted,
            GREATEST(s.verified_captures_total - s.verified_captures_unique, 0) AS per_node_per_day_removed,
            GREATEST(s.verified_captures_unique - LEAST(s.verified_captures_unique, 3), 0) AS per_day_removed,
            NOW() AS updated_at
        FROM (
            SELECT
                re.user_id AS user_id,
                re.rank_version AS rank_version,
                (timezone('UTC', re.created_at))::date AS day,
                COUNT(*)::int AS verified_captures_total,
                COUNT(DISTINCT COALESCE(re.node_id, re.capture_id, re.id))::int AS verified_captures_unique
            FROM rank_events re
            JOIN captures c ON re.capture_id = c.id
            WHERE
                re.event_type = 'capture_verified'
                AND re.rank_version = 'v1_points'
                AND c.state = 'verified'
            GROUP BY re.user_id, re.rank_version, (timezone('UTC', re.created_at))::date
        ) s
        """
    )

    op.execute(
        """
        INSERT INTO curator_rank_cache (
            user_id,
            rank_version,
            points_total,
            verified_captures_total,
            verified_captures_counted,
            per_node_per_day_removed,
            per_day_removed,
            updated_at
        )
        SELECT
            u.id AS user_id,
            'v1_points' AS rank_version,
            COALESCE(SUM(d.points_counted), 0)::int AS points_total,
            COALESCE(SUM(d.verified_captures_total), 0)::int AS verified_captures_total,
            COALESCE(SUM(d.points_counted), 0)::int AS verified_captures_counted,
            COALESCE(SUM(d.per_node_per_day_removed), 0)::int AS per_node_per_day_removed,
            COALESCE(SUM(d.per_day_removed), 0)::int AS per_day_removed,
            NOW() AS updated_at
        FROM users u
        LEFT JOIN curator_rank_daily d
            ON d.user_id = u.id AND d.rank_version = 'v1_points'
        GROUP BY u.id
        """
    )


def downgrade() -> None:
    op.drop_table("curator_rank_cache")
    op.drop_index("ix_curator_rank_daily_user_day", table_name="curator_rank_daily")
    op.drop_table("curator_rank_daily")

    op.create_table(
        "curator_profiles",
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
