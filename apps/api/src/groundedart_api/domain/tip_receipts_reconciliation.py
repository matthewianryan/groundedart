from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from groundedart_api.db.models import TipReceipt
from groundedart_api.domain.tip_receipts import TipReceiptFailureReason, TipReceiptStatus
from groundedart_api.domain.tip_receipts_solana import fetch_solana_transaction

FetchTransaction = Callable[[str, str], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class TransactionLookupResult:
    found: bool
    error: bool
    confirmation_status: TipReceiptStatus | None = None
    slot: int | None = None
    block_time: dt.datetime | None = None


def upgrade_confirmation_status(
    current: TipReceiptStatus, observed: TipReceiptStatus
) -> TipReceiptStatus:
    if current in {TipReceiptStatus.FINALIZED, TipReceiptStatus.FAILED}:
        return current
    if observed == TipReceiptStatus.FINALIZED:
        return TipReceiptStatus.FINALIZED
    if current == TipReceiptStatus.SEEN and observed == TipReceiptStatus.CONFIRMED:
        return TipReceiptStatus.CONFIRMED
    return current


def should_mark_failed_on_missing(
    *, first_seen_at: dt.datetime, now: dt.datetime, cutoff: dt.timedelta
) -> bool:
    return now - first_seen_at >= cutoff


def _parse_confirmation_status(value: Any) -> TipReceiptStatus:
    if value == "finalized":
        return TipReceiptStatus.FINALIZED
    if value == "confirmed":
        return TipReceiptStatus.CONFIRMED
    return TipReceiptStatus.SEEN


def parse_solana_transaction_lookup(response: dict[str, Any]) -> TransactionLookupResult:
    if response.get("error") is not None:
        return TransactionLookupResult(found=False, error=True)

    result = response.get("result")
    if not isinstance(result, dict):
        return TransactionLookupResult(found=False, error=False)

    slot = result.get("slot")
    if not isinstance(slot, int):
        slot = None

    block_time_raw = result.get("blockTime")
    block_time = None
    if isinstance(block_time_raw, int):
        block_time = dt.datetime.fromtimestamp(block_time_raw, tz=dt.UTC)

    confirmation_status = _parse_confirmation_status(result.get("confirmationStatus"))

    return TransactionLookupResult(
        found=True,
        error=False,
        confirmation_status=confirmation_status,
        slot=slot,
        block_time=block_time,
    )


async def reconcile_tip_receipts(
    db: AsyncSession,
    *,
    rpc_url: str,
    now: dt.datetime,
    reconciliation_interval: dt.timedelta,
    missing_cutoff: dt.timedelta,
    fetch_transaction: FetchTransaction = fetch_solana_transaction,
) -> int:
    threshold = now - reconciliation_interval
    receipts = await db.scalars(
        select(TipReceipt).where(
            TipReceipt.confirmation_status.in_(
                (
                    TipReceiptStatus.SEEN.value,
                    TipReceiptStatus.CONFIRMED.value,
                )
            ),
            TipReceipt.last_checked_at <= threshold,
        )
    )

    processed = 0
    for receipt in receipts:
        processed += 1
        try:
            response = await fetch_transaction(rpc_url, receipt.tx_signature)
        except Exception:
            lookup = TransactionLookupResult(found=False, error=True)
        else:
            lookup = parse_solana_transaction_lookup(response)

        if lookup.found and lookup.confirmation_status is not None:
            current_status = TipReceiptStatus(receipt.confirmation_status)
            new_status = upgrade_confirmation_status(current_status, lookup.confirmation_status)
            if new_status != current_status:
                receipt.confirmation_status = new_status.value
            if lookup.slot is not None:
                receipt.slot = lookup.slot
            if lookup.block_time is not None:
                receipt.block_time = lookup.block_time
        elif not lookup.error and should_mark_failed_on_missing(
            first_seen_at=receipt.first_seen_at,
            now=now,
            cutoff=missing_cutoff,
        ):
            receipt.confirmation_status = TipReceiptStatus.FAILED.value
            receipt.failure_reason = TipReceiptFailureReason.TX_NOT_FOUND

        receipt.last_checked_at = now

    if processed:
        await db.commit()

    return processed
