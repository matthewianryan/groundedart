from __future__ import annotations

import datetime as dt

import pytest

from groundedart_api.domain.tip_receipts import TipReceiptStatus
from groundedart_api.domain.tip_receipts_reconciliation import (
    should_mark_failed_on_missing,
    upgrade_confirmation_status,
)


@pytest.mark.parametrize(
    ("current", "observed", "expected"),
    [
        (TipReceiptStatus.SEEN, TipReceiptStatus.CONFIRMED, TipReceiptStatus.CONFIRMED),
        (TipReceiptStatus.SEEN, TipReceiptStatus.FINALIZED, TipReceiptStatus.FINALIZED),
        (TipReceiptStatus.CONFIRMED, TipReceiptStatus.FINALIZED, TipReceiptStatus.FINALIZED),
        (TipReceiptStatus.CONFIRMED, TipReceiptStatus.SEEN, TipReceiptStatus.CONFIRMED),
        (TipReceiptStatus.FINALIZED, TipReceiptStatus.CONFIRMED, TipReceiptStatus.FINALIZED),
        (TipReceiptStatus.FAILED, TipReceiptStatus.FINALIZED, TipReceiptStatus.FAILED),
    ],
)
def test_upgrade_confirmation_status(current, observed, expected) -> None:
    assert upgrade_confirmation_status(current, observed) == expected


def test_should_mark_failed_on_missing_cutoff() -> None:
    now = dt.datetime(2024, 1, 1, tzinfo=dt.UTC)
    cutoff = dt.timedelta(seconds=60)

    assert (
        should_mark_failed_on_missing(
            first_seen_at=now - dt.timedelta(seconds=61),
            now=now,
            cutoff=cutoff,
        )
        is True
    )
    assert (
        should_mark_failed_on_missing(
            first_seen_at=now - dt.timedelta(seconds=30),
            now=now,
            cutoff=cutoff,
        )
        is False
    )
