from __future__ import annotations

from enum import StrEnum


class CaptureStateReasonCode(StrEnum):
    geo_passed = "geo_passed"
    image_uploaded = "image_uploaded"
