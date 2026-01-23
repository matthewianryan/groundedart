from __future__ import annotations

from groundedart_api.domain.capture_state import CaptureState, assert_valid_capture_transition
from groundedart_api.domain.capture_state_reason_code import CaptureStateReasonCode
from groundedart_api.domain.errors import AppError

REASON_REQUIRED_STATES = {
    CaptureState.pending_verification,
    CaptureState.rejected,
    CaptureState.hidden,
}


def validate_capture_state_reason(
    target_state: CaptureState, reason_code: str | None
) -> str | None:
    if reason_code is None:
        if target_state in REASON_REQUIRED_STATES:
            raise AppError(
                code="capture_state_reason_required",
                message="State reason is required for this transition",
                status_code=400,
            )
        return None

    try:
        CaptureStateReasonCode(reason_code)
    except ValueError as exc:
        raise AppError(
            code="invalid_capture_state_reason",
            message="Invalid capture state reason",
            status_code=400,
        ) from exc

    return reason_code


def apply_capture_state_transition(
    current_state: CaptureState,
    target_state: CaptureState,
    reason_code: str | None,
) -> str | None:
    try:
        assert_valid_capture_transition(current_state, target_state)
    except ValueError as exc:
        raise AppError(
            code="invalid_capture_state_transition",
            message=str(exc),
            status_code=400,
        ) from exc

    return validate_capture_state_reason(target_state, reason_code)
