from __future__ import annotations

from enum import StrEnum


class CaptureState(StrEnum):
    draft = "draft"
    pending_verification = "pending_verification"
    verified = "verified"
    rejected = "rejected"
    hidden = "hidden"


ALLOWED_CAPTURE_TRANSITIONS: dict[CaptureState, set[CaptureState]] = {
    CaptureState.draft: {CaptureState.pending_verification, CaptureState.hidden},
    CaptureState.pending_verification: {
        CaptureState.verified,
        CaptureState.rejected,
        CaptureState.hidden,
    },
    CaptureState.verified: {CaptureState.hidden},
    CaptureState.rejected: {CaptureState.hidden},
    CaptureState.hidden: set(),
}


def assert_valid_capture_transition(current: CaptureState, target: CaptureState) -> None:
    allowed = ALLOWED_CAPTURE_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise ValueError(f"Invalid capture transition: {current} -> {target}")
