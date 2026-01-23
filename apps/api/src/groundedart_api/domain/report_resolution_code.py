from __future__ import annotations

from enum import StrEnum


class ReportResolutionCode(StrEnum):
    dismissed = "dismissed"
    hide_capture = "hide_capture"
    rights_takedown = "rights_takedown"
