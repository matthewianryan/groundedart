from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy import select

from groundedart_api.api.schemas import CapturePublic, CreateCaptureRequest, CreateCaptureResponse
from groundedart_api.auth.deps import CurrentUser
from groundedart_api.auth.tokens import hash_opaque_token
from groundedart_api.db.models import Capture, CheckinToken, utcnow
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.errors import AppError
from groundedart_api.settings import Settings, get_settings
from groundedart_api.storage.local import LocalMediaStorage

router = APIRouter(prefix="/v1", tags=["captures"])


def _capture_to_public(capture: Capture, base_media_url: str = "/media") -> CapturePublic:
    image_url = f"{base_media_url}/{capture.image_path}" if capture.image_path else None
    return CapturePublic(
        id=capture.id,
        node_id=capture.node_id,
        state=capture.state,
        created_at=capture.created_at,
        image_url=image_url,
    )


@router.post("/captures", response_model=CreateCaptureResponse)
async def create_capture(
    body: CreateCaptureRequest,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
) -> CreateCaptureResponse:
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
    if token.is_expired:
        raise AppError(
            code="checkin_token_expired",
            message="Check-in token expired",
            status_code=400,
        )

    token.used_at = utcnow()
    capture = Capture(
        user_id=user.id,
        node_id=body.node_id,
        attribution_artist_name=body.attribution_artist_name,
        attribution_artwork_title=body.attribution_artwork_title,
        state="pending_verification",
        state_reason="geo_passed",
    )
    db.add(capture)
    await db.commit()
    await db.refresh(capture)
    return CreateCaptureResponse(capture=_capture_to_public(capture))


@router.post("/captures/{capture_id}/image", response_model=CapturePublic)
async def upload_capture_image(
    capture_id: uuid.UUID,
    file: UploadFile,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
) -> CapturePublic:
    capture = await db.get(Capture, capture_id)
    if capture is None:
        raise AppError(code="capture_not_found", message="Capture not found", status_code=404)
    if capture.user_id != user.id:
        raise AppError(code="forbidden", message="Forbidden", status_code=403)

    storage = LocalMediaStorage(settings)
    stored = await storage.save_capture_image(capture_id=capture.id, upload=file)
    capture.image_path = stored.path
    capture.image_mime = stored.mime
    await db.commit()
    await db.refresh(capture)
    return _capture_to_public(capture)
