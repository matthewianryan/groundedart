from __future__ import annotations

from enum import StrEnum


class CaptureStateReasonCode(StrEnum):
    geo_passed = "geo_passed"
    image_uploaded = "image_uploaded"
    manual_review_pass = "manual_review_pass"
    manual_review_reject = "manual_review_reject"
    manual_review_hide = "manual_review_hide"
    report_hide = "report_hide"
    rights_takedown = "rights_takedown"
