from __future__ import annotations

from dataclasses import dataclass
import datetime as dt
from enum import StrEnum
from typing import Protocol
import uuid


class TipReceiptStatus(StrEnum):
    SEEN = "seen"
    CONFIRMED = "confirmed"
    FINALIZED = "finalized"
    FAILED = "failed"


class TipReceiptFailureReason(StrEnum):
    INTENT_EXPIRED = "intent_expired"
    TX_NOT_FOUND = "tx_not_found"
    MEMO_MISSING = "memo_missing"
    TRANSFER_MISMATCH = "transfer_mismatch"
    INVALID_TRANSACTION = "invalid_transaction"
    RPC_ERROR = "rpc_error"


@dataclass(frozen=True)
class TipReceiptVerificationSuccess:
    from_pubkey: str
    to_pubkey: str
    amount_lamports: int
    slot: int | None
    block_time: dt.datetime | None
    confirmation_status: TipReceiptStatus


@dataclass(frozen=True)
class TipReceiptVerificationFailure:
    reason: TipReceiptFailureReason
    slot: int | None = None
    block_time: dt.datetime | None = None


TipReceiptVerification = TipReceiptVerificationSuccess | TipReceiptVerificationFailure


class TipReceiptProvider(Protocol):
    async def verify_tip_receipt(
        self,
        *,
        tip_intent_id: uuid.UUID,
        tx_signature: str,
        expected_to_pubkey: str,
        expected_amount_lamports: int,
    ) -> TipReceiptVerification:
        ...
