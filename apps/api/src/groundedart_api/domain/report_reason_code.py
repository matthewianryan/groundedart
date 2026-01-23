from __future__ import annotations

from enum import StrEnum


class ReportReasonCode(StrEnum):
    spam = "spam"
    rights_violation = "rights_violation"
    privacy = "privacy"
    harassment = "harassment"
    other = "other"
