from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy import func, select

from groundedart_api.api.schemas import (
    CapturePublic,
    CreateCaptureRequest,
    CreateCaptureResponse,
    CreateReportRequest,
    CreateReportResponse,
    ReportPublic,
    UpdateCaptureRequest,
)
from groundedart_api.auth.deps import CurrentUser
from groundedart_api.auth.tokens import hash_opaque_token
from groundedart_api.db.models import Capture, CheckinToken, ContentReport, Node
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.abuse_events import record_abuse_event
from groundedart_api.domain.attribution_rights import (
    is_capture_publicly_visible,
    missing_attribution_fields,
    missing_rights_fields,
)
from groundedart_api.domain.capture_events import (
    apply_capture_transition_with_audit,
    record_capture_created_event,
    record_capture_published_event,
)
from groundedart_api.domain.capture_state import CaptureState
from groundedart_api.domain.capture_transitions import validate_capture_state_reason
from groundedart_api.domain.errors import AppError
from groundedart_api.domain.gating import assert_can_create_capture
from groundedart_api.domain.rank_projection import get_rank_for_user
from groundedart_api.domain.report_reason_code import ReportReasonCode
from groundedart_api.domain.verification_events import VerificationEventEmitterDep
from groundedart_api.observability import metrics
from groundedart_api.observability.ops import observe_operation
from groundedart_api.settings import Settings, get_settings
from groundedart_api.storage.deps import MediaStorageDep
from groundedart_api.time import UtcNow, get_utcnow

router = APIRouter(prefix="/v1", tags=["captures"])


def _with_retry_after(
    *,
    details: dict[str, object],
    now_time: dt.datetime,
    retry_at: dt.datetime | None,
) -> dict[str, object]:
    if retry_at is None:
        return details
    retry_after_seconds = max(0, int((retry_at - now_time).total_seconds()))
    details["retry_after_seconds"] = retry_after_seconds
    details["retry_at"] = retry_at.isoformat()
    return details


def capture_to_public(capture: Capture, base_media_url: str = "/media") -> CapturePublic:
    image_url = f"{base_media_url}/{capture.image_path}" if capture.image_path else None
    return CapturePublic(
        id=capture.id,
        node_id=capture.node_id,
        state=capture.state,
        visibility=capture.visibility,
        created_at=capture.created_at,
        image_url=image_url,
        attribution_artist_name=capture.attribution_artist_name,
        attribution_artwork_title=capture.attribution_artwork_title,
        attribution_source=capture.attribution_source,
        attribution_source_url=capture.attribution_source_url,
        rights_basis=capture.rights_basis,
        rights_attested_at=capture.rights_attested_at,
    )


def report_to_public(report: ContentReport) -> ReportPublic:
    return ReportPublic(
        id=report.id,
        capture_id=report.capture_id,
        node_id=report.node_id,
        reason=report.reason,
        details=report.details,
        created_at=report.created_at,
        resolved_at=report.resolved_at,
        resolution=report.resolution,
    )


@router.post("/captures", response_model=CreateCaptureResponse)
async def create_capture(
    body: CreateCaptureRequest,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
    now: UtcNow = Depends(get_utcnow),
) -> CreateCaptureResponse:
    now_time = now()
    token_hash = hash_opaque_token(body.checkin_token, settings)
    token = await db.scalar(
        select(CheckinToken).where(
            CheckinToken.token_hash == token_hash,
            CheckinToken.used_at.is_(None),
        )
    )
    if token is None or token.user_id != user.id or token.node_id != body.node_id:
        raise AppError(
            code="invalid_checkin_token",
            message="Invalid check-in token",
            status_code=400,
        )
    if now_time >= token.expires_at:
        raise AppError(
            code="checkin_token_expired",
            message="Check-in token expired",
            status_code=400,
        )

    node = await db.get(Node, body.node_id)
    if node is None:
        raise AppError(
            code="invalid_checkin_token",
            message="Invalid check-in token",
            status_code=400,
        )

    rank = await get_rank_for_user(db=db, user_id=user.id)

    window_start = now_time - dt.timedelta(seconds=settings.capture_rate_window_seconds)
    recent_captures = await db.scalar(
        select(func.count())
        .select_from(Capture)
        .where(
            Capture.user_id == user.id,
            Capture.node_id == body.node_id,
            Capture.created_at >= window_start,
        )
    )
    recent_count = int(recent_captures or 0)
    try:
        assert_can_create_capture(
            rank=rank,
            node_min_rank=node.min_rank,
            recent_captures=recent_count,
            window_seconds=settings.capture_rate_window_seconds,
        )
    except AppError as exc:
        if exc.code == "capture_rate_limited":
            details = dict(exc.details or {})
            details["source"] = "capture_create"
            details["recent_count"] = recent_count
            max_per_window = int(details.get("max_per_window") or 0)
            window_seconds = int(
                details.get("window_seconds") or settings.capture_rate_window_seconds
            )
            retry_at = None
            if max_per_window > 0 and recent_count > 0:
                offset = max(0, recent_count - max_per_window)
                nth_oldest = await db.scalar(
                    select(Capture.created_at)
                    .where(
                        Capture.user_id == user.id,
                        Capture.node_id == body.node_id,
                        Capture.created_at >= window_start,
                    )
                    .order_by(Capture.created_at.asc(), Capture.id.asc())
                    .offset(offset)
                    .limit(1)
                )
                if nth_oldest is not None:
                    retry_at = nth_oldest + dt.timedelta(seconds=window_seconds)
            exc.details = _with_retry_after(details=details, now_time=now_time, retry_at=retry_at)
            await record_abuse_event(
                db=db,
                event_type="capture_rate_limited",
                user_id=user.id,
                node_id=token.node_id,
                details=details,
            )
        raise

    token.used_at = now_time
    capture = Capture(
        user_id=user.id,
        node_id=body.node_id,
        attribution_artist_name=body.attribution_artist_name,
        attribution_artwork_title=body.attribution_artwork_title,
        attribution_source=body.attribution_source,
        attribution_source_url=body.attribution_source_url,
        rights_basis=body.rights_basis,
        rights_attested_at=now_time if body.rights_attestation else None,
        visibility="private",
        state=CaptureState.draft.value,
        state_reason=validate_capture_state_reason(CaptureState.draft, "geo_passed"),
    )
    db.add(capture)
    await db.flush()
    record_capture_created_event(
        db=db,
        capture=capture,
        actor_type="user",
        actor_user_id=user.id,
        reason_code=capture.state_reason,
    )
    await db.commit()
    await db.refresh(capture)
    return CreateCaptureResponse(capture=capture_to_public(capture))


@router.get("/captures/{capture_id}", response_model=CapturePublic)
async def get_capture(
    capture_id: uuid.UUID,
    db: DbSessionDep,
    user: CurrentUser,
) -> CapturePublic:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)
    if capture.user_id != user.id:
        raise AppError(code="forbidden", message="Forbidden", status_code=403)
    return capture_to_public(capture)


@router.patch("/captures/{capture_id}", response_model=CapturePublic)
async def update_capture(
    capture_id: uuid.UUID,
    body: UpdateCaptureRequest,
    db: DbSessionDep,
    user: CurrentUser,
    now: UtcNow = Depends(get_utcnow),
) -> CapturePublic:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)
    if capture.user_id != user.id:
        raise AppError(code="forbidden", message="Forbidden", status_code=403)

    fields = body.model_fields_set
    if "attribution_artist_name" in fields:
        capture.attribution_artist_name = body.attribution_artist_name
    if "attribution_artwork_title" in fields:
        capture.attribution_artwork_title = body.attribution_artwork_title
    if "attribution_source" in fields:
        capture.attribution_source = body.attribution_source
    if "attribution_source_url" in fields:
        capture.attribution_source_url = body.attribution_source_url
    if "rights_basis" in fields:
        capture.rights_basis = body.rights_basis
    if "rights_attestation" in fields:
        capture.rights_attested_at = now() if body.rights_attestation else None

    await db.commit()
    await db.refresh(capture)
    return capture_to_public(capture)


@router.post("/captures/{capture_id}/reports", response_model=CreateReportResponse)
async def create_report(
    capture_id: uuid.UUID,
    body: CreateReportRequest,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
    now: UtcNow = Depends(get_utcnow),
) -> CreateReportResponse:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)
    if capture.user_id != user.id and not is_capture_publicly_visible(capture):
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)

    try:
        reason = ReportReasonCode(body.reason)
    except ValueError as exc:
        raise AppError(
            code="invalid_report_reason",
            message="Invalid report reason",
            status_code=400,
        ) from exc

    window_start = now() - dt.timedelta(seconds=settings.report_rate_window_seconds)
    recent_reports = await db.scalar(
        select(func.count())
        .select_from(ContentReport)
        .where(
            ContentReport.user_id == user.id,
            ContentReport.created_at >= window_start,
        )
    )
    recent_count = int(recent_reports or 0)
    if recent_count >= settings.max_reports_per_user_per_window:
        details = {
            "max_per_window": settings.max_reports_per_user_per_window,
            "window_seconds": settings.report_rate_window_seconds,
            "recent_count": recent_count,
            "source": "report_create",
        }
        await record_abuse_event(
            db=db,
            event_type="report_rate_limited",
            user_id=user.id,
            node_id=capture.node_id,
            capture_id=capture.id,
            details=details,
        )
        raise AppError(
            code="report_rate_limited",
            message="Report rate limit exceeded",
            status_code=429,
            details=details,
        )

    report = ContentReport(
        capture_id=capture.id,
        node_id=capture.node_id,
        user_id=user.id,
        reason=reason.value,
        details=body.details,
        created_at=now(),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return CreateReportResponse(report=report_to_public(report))


@router.post("/captures/{capture_id}/publish", response_model=CapturePublic)
async def publish_capture(
    capture_id: uuid.UUID,
    db: DbSessionDep,
    user: CurrentUser,
) -> CapturePublic:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)
    if capture.user_id != user.id:
        raise AppError(code="forbidden", message="Forbidden", status_code=403)
    if capture.state != CaptureState.verified.value:
        raise AppError(
            code="capture_not_verified",
            message="Capture is not verified yet",
            status_code=400,
        )

    missing_attribution = missing_attribution_fields(capture)
    if missing_attribution:
        raise AppError(
            code="capture_missing_attribution",
            message="Attribution fields required for publish",
            status_code=400,
            details={"missing_fields": missing_attribution},
        )

    missing_rights = missing_rights_fields(capture)
    if missing_rights:
        raise AppError(
            code="capture_missing_rights",
            message="Rights attestation required for publish",
            status_code=400,
            details={"missing_fields": missing_rights},
        )

    if capture.visibility != "public":
        previous_visibility = capture.visibility
        capture.visibility = "public"
        record_capture_published_event(
            db=db,
            capture=capture,
            actor_type="user",
            actor_user_id=user.id,
            details={"previous_visibility": previous_visibility},
        )
    await db.commit()
    await db.refresh(capture)
    return capture_to_public(capture)


@router.post("/captures/{capture_id}/image", response_model=CapturePublic)
async def upload_capture_image(
    capture_id: uuid.UUID,
    file: UploadFile,
    db: DbSessionDep,
    user: CurrentUser,
    storage: MediaStorageDep,
    verification_events: VerificationEventEmitterDep,
    settings: Settings = Depends(get_settings),
) -> CapturePublic:
    async with observe_operation(
        "upload_capture_image",
        attributes={
            "capture.id": str(capture_id),
        },
    ):
        capture = await db.get(Capture, capture_id)
        if capture is None:
            raise AppError(code="capture_not_found", message="Capture not found", status_code=404)
        if capture.user_id != user.id:
            raise AppError(code="forbidden", message="Forbidden", status_code=403)

        if capture.state == CaptureState.draft.value:
            pending_count = await db.scalar(
                select(func.count())
                .select_from(Capture)
                .where(
                    Capture.node_id == capture.node_id,
                    Capture.state == CaptureState.pending_verification.value,
                )
            )
            if (pending_count or 0) >= settings.max_pending_verification_captures_per_node:
                await record_abuse_event(
                    db=db,
                    event_type="pending_verification_cap_reached",
                    user_id=user.id,
                    node_id=capture.node_id,
                    capture_id=capture.id,
                    details={
                        "max_pending_per_node": settings.max_pending_verification_captures_per_node,
                        "pending_count": int(pending_count or 0),
                    },
                )
                raise AppError(
                    code="pending_verification_cap_reached",
                    message="Pending verification cap reached",
                    status_code=429,
                    details={
                        "max_pending_per_node": settings.max_pending_verification_captures_per_node,
                    },
                )

        stored = await storage.save_capture_image(capture_id=capture.id, upload=file)
        metrics.upload_bytes_total.labels(mime=stored.mime or "", outcome="success").inc(
            float(stored.bytes_written)
        )
        capture.image_path = stored.path
        capture.image_mime = stored.mime
        promoted = False
        if capture.state == CaptureState.draft.value:
            apply_capture_transition_with_audit(
                db=db,
                capture=capture,
                target_state=CaptureState.pending_verification,
                reason_code="image_uploaded",
                actor_type="user",
                actor_user_id=user.id,
            )
            promoted = True
        await db.commit()
        await db.refresh(capture)
        if promoted:
            await verification_events.capture_uploaded(
                capture_id=capture.id,
                node_id=capture.node_id,
                user_id=capture.user_id,
            )
        return capture_to_public(capture)
