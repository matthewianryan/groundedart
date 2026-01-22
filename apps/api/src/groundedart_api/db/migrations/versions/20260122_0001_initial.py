"""initial

Revision ID: 20260122_0001
Revises:
Create Date: 2026-01-22

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision = "20260122_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    op.create_table(
        "users",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "curator_profiles",
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            primary_key=True,
        ),
        sa.Column("rank", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "devices",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("device_id", sa.String(length=64), nullable=False),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_devices_device_id", "devices", ["device_id"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"], unique=True)

    op.create_table(
        "nodes",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("location", Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("radius_m", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("min_rank", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_nodes_location", "nodes", ["location"], postgresql_using="gist")

    op.create_table(
        "checkin_challenges",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "node_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("nodes.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", "node_id", "id"),
    )

    op.create_table(
        "checkin_tokens",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "node_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("nodes.id"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_checkin_tokens_token_hash", "checkin_tokens", ["token_hash"], unique=True)

    op.create_table(
        "captures",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "node_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("nodes.id"),
            nullable=False,
        ),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("state_reason", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attribution_artist_name", sa.String(length=200), nullable=True),
        sa.Column("attribution_artwork_title", sa.String(length=200), nullable=True),
        sa.Column("image_path", sa.Text(), nullable=True),
        sa.Column("image_mime", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("captures")
    op.drop_index("ix_checkin_tokens_token_hash", table_name="checkin_tokens")
    op.drop_table("checkin_tokens")
    op.drop_table("checkin_challenges")
    op.drop_index("ix_nodes_location", table_name="nodes")
    op.drop_table("nodes")
    op.drop_index("ix_sessions_token_hash", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_devices_device_id", table_name="devices")
    op.drop_table("devices")
    op.drop_table("curator_profiles")
    op.drop_table("users")
