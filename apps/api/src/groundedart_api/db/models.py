from __future__ import annotations

import datetime as dt
import uuid

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from groundedart_api.domain.capture_state import CaptureState


class Base(DeclarativeBase):
    pass


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )

    devices: Mapped[list[Device]] = relationship(back_populates="user")
    sessions: Mapped[list[Session]] = relationship(back_populates="user")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    last_seen_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )

    user: Mapped[User] = relationship(back_populates="devices")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")

    @property
    def is_expired(self) -> bool:
        return utcnow() >= self.expires_at


class CuratorRankDaily(Base):
    __tablename__ = "curator_rank_daily"
    __table_args__ = (
        UniqueConstraint("user_id", "rank_version", "day", name="uq_curator_rank_daily_user_version_day"),
        Index("ix_curator_rank_daily_user_day", "user_id", "day"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        primary_key=True,
    )
    rank_version: Mapped[str] = mapped_column(String(32), primary_key=True)
    day: Mapped[dt.date] = mapped_column(Date, primary_key=True)

    verified_captures_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verified_captures_unique: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_counted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    per_node_per_day_removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    per_day_removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class CuratorRankCache(Base):
    __tablename__ = "curator_rank_cache"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        primary_key=True,
    )
    rank_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1_points")

    points_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verified_captures_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verified_captures_counted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    per_node_per_day_removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    per_day_removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Artist(Base):
    __tablename__ = "artists"
    __table_args__ = (
        CheckConstraint(
            "solana_recipient_pubkey ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'",
            name="ck_artists_solana_pubkey",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    solana_recipient_pubkey: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    nodes_defaulting: Mapped[list[Node]] = relationship(back_populates="default_artist")


class Node(Base):
    __tablename__ = "nodes"
    __table_args__ = (CheckConstraint("radius_m >= 25", name="ck_nodes_radius_m_min_25"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326),
        nullable=False,
    )
    radius_m: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    min_rank: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    default_artist_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artists.id"), nullable=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )

    default_artist: Mapped[Artist | None] = relationship(back_populates="nodes_defaulting")


class TipIntent(Base):
    __tablename__ = "tip_intents"
    __table_args__ = (
        CheckConstraint(
            "status in ('open', 'expired', 'completed', 'canceled')",
            name="ck_tip_intents_status",
        ),
        Index("ix_tip_intents_node_id", "node_id"),
        Index("ix_tip_intents_artist_id", "artist_id"),
        Index("ix_tip_intents_created_by_user_id", "created_by_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=False
    )
    artist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artists.id"), nullable=False
    )
    amount_lamports: Mapped[int] = mapped_column(Integer, nullable=False)
    to_pubkey: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")


class TipReceipt(Base):
    __tablename__ = "tip_receipts"
    __table_args__ = (
        CheckConstraint(
            "confirmation_status in ('seen', 'confirmed', 'finalized', 'failed')",
            name="ck_tip_receipts_confirmation_status",
        ),
        UniqueConstraint("tip_intent_id", name="uq_tip_receipts_tip_intent_id"),
        UniqueConstraint("tx_signature", name="uq_tip_receipts_tx_signature"),
        Index("ix_tip_receipts_confirmation_status", "confirmation_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tip_intent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tip_intents.id"), nullable=False
    )
    tx_signature: Mapped[str] = mapped_column(String(128), nullable=False)
    from_pubkey: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_pubkey: Mapped[str] = mapped_column(String(64), nullable=False)
    amount_lamports: Mapped[int] = mapped_column(Integer, nullable=False)
    slot: Mapped[int | None] = mapped_column(Integer, nullable=True)
    block_time: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmation_status: Mapped[str] = mapped_column(String(16), nullable=False)
    first_seen_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    last_checked_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    failure_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)


class CheckinChallenge(Base):
    __tablename__ = "checkin_challenges"
    __table_args__ = (
        UniqueConstraint("user_id", "node_id", "id"),
        Index(
            "ix_checkin_challenges_user_node_expires",
            "user_id",
            "node_id",
            "expires_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=False
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CheckinToken(Base):
    __tablename__ = "checkin_tokens"
    __table_args__ = (
        Index(
            "ix_checkin_tokens_user_node_expires",
            "user_id",
            "node_id",
            "expires_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def is_expired(self) -> bool:
        return utcnow() >= self.expires_at


class Capture(Base):
    __tablename__ = "captures"
    __table_args__ = (
        CheckConstraint(
            "rights_basis IS NULL OR rights_basis IN ('i_took_photo', 'permission_granted', 'public_domain')",
            name="ck_captures_rights_basis",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=False
    )

    state: Mapped[str] = mapped_column(
        String(32),
        default=CaptureState.draft.value,
        nullable=False,
    )
    visibility: Mapped[str] = mapped_column(String(16), default="private", nullable=False)
    publish_requested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    state_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    attribution_artist_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    attribution_artwork_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    attribution_source: Mapped[str | None] = mapped_column(String(200), nullable=True)
    attribution_source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rights_basis: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rights_attested_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)


class ContentReport(Base):
    __tablename__ = "content_reports"
    __table_args__ = (
        Index("ix_content_reports_capture_created", "capture_id", "created_at"),
        Index("ix_content_reports_created_at", "created_at"),
        Index("ix_content_reports_resolved_at", "resolved_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capture_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("captures.id"), nullable=False
    )
    node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    resolved_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution: Mapped[str | None] = mapped_column(String(64), nullable=True)


class UserNotification(Base):
    __tablename__ = "user_notifications"
    __table_args__ = (
        Index("ix_user_notifications_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    read_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CaptureEvent(Base):
    __tablename__ = "capture_events"
    __table_args__ = (Index("ix_capture_events_capture_created", "capture_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capture_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("captures.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    from_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    details: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)


class CuratorRankEvent(Base):
    __tablename__ = "rank_events"
    __table_args__ = (
        UniqueConstraint(
            "deterministic_id",
            name="uq_rank_events_deterministic_id",
        ),
        Index("ix_rank_events_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deterministic_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    rank_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1_points")
    capture_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("captures.id"), nullable=True
    )
    node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    details: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)


class AbuseEvent(Base):
    __tablename__ = "abuse_events"
    __table_args__ = (
        Index("ix_abuse_events_created_at", "created_at"),
        Index("ix_abuse_events_user_node_created", "user_id", "node_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("nodes.id"), nullable=True
    )
    capture_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("captures.id"), nullable=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    details: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
