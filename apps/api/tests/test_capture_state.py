from groundedart_api.domain.capture_state import CaptureState, assert_valid_capture_transition


def test_capture_transitions_allow_expected_paths() -> None:
    assert_valid_capture_transition(CaptureState.draft, CaptureState.pending_verification)
    assert_valid_capture_transition(CaptureState.pending_verification, CaptureState.verified)


def test_capture_transitions_reject_invalid_paths() -> None:
    try:
        assert_valid_capture_transition(CaptureState.verified, CaptureState.pending_verification)
    except ValueError:
        return
    raise AssertionError("Expected ValueError")

