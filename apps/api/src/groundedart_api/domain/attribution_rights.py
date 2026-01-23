from __future__ import annotations

from groundedart_api.db.models import Capture
from groundedart_api.domain.capture_state import CaptureState

REQUIRED_ATTRIBUTION_FIELDS = (
    "attribution_artist_name",
    "attribution_artwork_title",
    "attribution_source",
)
REQUIRED_RIGHTS_FIELDS = ("rights_basis", "rights_attested_at")


def _has_text(value: str | None) -> bool:
    return bool(value and value.strip())


def missing_attribution_fields(capture: Capture) -> list[str]:
    missing: list[str] = []
    if not _has_text(capture.attribution_artist_name):
        missing.append("attribution_artist_name")
    if not _has_text(capture.attribution_artwork_title):
        missing.append("attribution_artwork_title")
    if not _has_text(capture.attribution_source):
        missing.append("attribution_source")
    return missing


def missing_rights_fields(capture: Capture) -> list[str]:
    missing: list[str] = []
    if not _has_text(capture.rights_basis):
        missing.append("rights_basis")
    if capture.rights_attested_at is None:
        missing.append("rights_attested_at")
    return missing


def missing_public_requirements(capture: Capture) -> list[str]:
    return missing_attribution_fields(capture) + missing_rights_fields(capture)


def is_capture_publicly_visible(capture: Capture) -> bool:
    if capture.state != CaptureState.verified.value:
        return False
    if capture.visibility != "public":
        return False
    if missing_attribution_fields(capture):
        return False
    if missing_rights_fields(capture):
        return False
    return True
