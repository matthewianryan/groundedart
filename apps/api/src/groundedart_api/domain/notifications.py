from __future__ import annotations

from groundedart_api.db.models import Capture, UserNotification

MISSING_FIELD_LABELS: dict[str, str] = {
    "attribution_artist_name": "artist name",
    "attribution_artwork_title": "artwork title",
    "attribution_source": "attribution source",
    "rights_basis": "rights basis",
    "rights_attested_at": "rights attestation",
}


def _format_missing_fields(missing_fields: list[str]) -> str:
    labels = [MISSING_FIELD_LABELS.get(field, field) for field in missing_fields]
    return ", ".join(labels)


def record_capture_verified_notification(
    *,
    capture: Capture,
    missing_fields: list[str],
    published: bool,
) -> UserNotification:
    title = "Capture verified"
    body = "Your capture has been verified."
    if published:
        title = "Capture verified & published"
        body = "Your capture is now public."
    elif missing_fields:
        body = f"Missing to publish: {_format_missing_fields(missing_fields)}."

    details = {
        "capture_id": str(capture.id),
        "node_id": str(capture.node_id),
        "missing_fields": missing_fields,
        "published": published,
        "publish_requested": bool(capture.publish_requested),
    }
    return UserNotification(
        user_id=capture.user_id,
        event_type="capture_verified",
        title=title,
        body=body,
        details=details,
    )
