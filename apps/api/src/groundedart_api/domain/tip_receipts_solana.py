from __future__ import annotations

import datetime as dt
from typing import Any
import uuid

import httpx
from fastapi import Depends

from groundedart_api.domain.tip_receipts import (
    TipReceiptFailureReason,
    TipReceiptProvider,
    TipReceiptStatus,
    TipReceiptVerification,
    TipReceiptVerificationFailure,
    TipReceiptVerificationSuccess,
)
from groundedart_api.settings import Settings, get_settings

_MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"


async def fetch_solana_transaction(
    rpc_url: str, tx_signature: str, *, commitment: str | None = None
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "encoding": "jsonParsed",
        "maxSupportedTransactionVersion": 0,
    }
    if commitment:
        params["commitment"] = commitment
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [
            tx_signature,
            params,
        ],
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(rpc_url, json=payload)
    response.raise_for_status()
    return response.json()


def _extract_memo_text(instruction: dict[str, Any]) -> str | None:
    program = instruction.get("program")
    program_id = instruction.get("programId")
    if program not in {"spl-memo", "memo"} and program_id != _MEMO_PROGRAM_ID:
        return None
    parsed = instruction.get("parsed")
    if isinstance(parsed, str):
        return parsed
    if isinstance(parsed, dict):
        info = parsed.get("info")
        if isinstance(info, dict):
            memo = info.get("memo") or info.get("data")
            if isinstance(memo, str):
                return memo
        memo = parsed.get("memo")
        if isinstance(memo, str):
            return memo
    return None


def _extract_transfer(instruction: dict[str, Any]) -> dict[str, Any] | None:
    if instruction.get("program") != "system":
        return None
    parsed = instruction.get("parsed")
    if not isinstance(parsed, dict):
        return None
    if parsed.get("type") != "transfer":
        return None
    info = parsed.get("info")
    if not isinstance(info, dict):
        return None
    source = info.get("source")
    destination = info.get("destination")
    lamports = info.get("lamports")
    if not isinstance(source, str) or not isinstance(destination, str):
        return None
    if isinstance(lamports, str):
        try:
            lamports = int(lamports)
        except ValueError:
            return None
    if not isinstance(lamports, int):
        return None
    return {
        "source": source,
        "destination": destination,
        "lamports": lamports,
    }


def _parse_confirmation_status(value: Any) -> TipReceiptStatus:
    if value == "finalized":
        return TipReceiptStatus.FINALIZED
    if value == "confirmed":
        return TipReceiptStatus.CONFIRMED
    return TipReceiptStatus.SEEN


class SolanaTipReceiptProvider:
    def __init__(self, rpc_url: str) -> None:
        self._rpc_url = rpc_url

    async def verify_tip_receipt(
        self,
        *,
        tip_intent_id: uuid.UUID,
        tx_signature: str,
        expected_to_pubkey: str,
        expected_amount_lamports: int,
    ) -> TipReceiptVerification:
        try:
            response = await fetch_solana_transaction(
                self._rpc_url,
                tx_signature,
                commitment="confirmed",
            )
        except (httpx.HTTPError, ValueError):
            return TipReceiptVerificationFailure(reason=TipReceiptFailureReason.RPC_ERROR)

        if response.get("error") is not None:
            return TipReceiptVerificationFailure(reason=TipReceiptFailureReason.RPC_ERROR)

        result = response.get("result")
        if not isinstance(result, dict):
            return TipReceiptVerificationFailure(reason=TipReceiptFailureReason.TX_NOT_FOUND)

        slot = result.get("slot")
        if not isinstance(slot, int):
            slot = None

        block_time_raw = result.get("blockTime")
        block_time = None
        if isinstance(block_time_raw, int):
            block_time = dt.datetime.fromtimestamp(block_time_raw, tz=dt.UTC)

        meta = result.get("meta")
        if isinstance(meta, dict) and meta.get("err") is not None:
            return TipReceiptVerificationFailure(
                reason=TipReceiptFailureReason.INVALID_TRANSACTION,
                slot=slot,
                block_time=block_time,
            )

        transaction = result.get("transaction")
        if not isinstance(transaction, dict):
            return TipReceiptVerificationFailure(
                reason=TipReceiptFailureReason.INVALID_TRANSACTION,
                slot=slot,
                block_time=block_time,
            )
        message = transaction.get("message")
        if not isinstance(message, dict):
            return TipReceiptVerificationFailure(
                reason=TipReceiptFailureReason.INVALID_TRANSACTION,
                slot=slot,
                block_time=block_time,
            )
        instructions = message.get("instructions")
        if not isinstance(instructions, list):
            return TipReceiptVerificationFailure(
                reason=TipReceiptFailureReason.INVALID_TRANSACTION,
                slot=slot,
                block_time=block_time,
            )

        memo_ok = False
        tip_intent_text = str(tip_intent_id)
        for instruction in instructions:
            if not isinstance(instruction, dict):
                continue
            memo_text = _extract_memo_text(instruction)
            if memo_text and tip_intent_text in memo_text:
                memo_ok = True
                break
        if not memo_ok:
            return TipReceiptVerificationFailure(
                reason=TipReceiptFailureReason.MEMO_MISSING,
                slot=slot,
                block_time=block_time,
            )

        matching_transfer = None
        for instruction in instructions:
            if not isinstance(instruction, dict):
                continue
            transfer = _extract_transfer(instruction)
            if not transfer:
                continue
            if (
                transfer["destination"] == expected_to_pubkey
                and transfer["lamports"] == expected_amount_lamports
            ):
                matching_transfer = transfer
                break

        if not matching_transfer:
            return TipReceiptVerificationFailure(
                reason=TipReceiptFailureReason.TRANSFER_MISMATCH,
                slot=slot,
                block_time=block_time,
            )

        confirmation_status = _parse_confirmation_status(result.get("confirmationStatus"))

        return TipReceiptVerificationSuccess(
            from_pubkey=matching_transfer["source"],
            to_pubkey=matching_transfer["destination"],
            amount_lamports=matching_transfer["lamports"],
            slot=slot,
            block_time=block_time,
            confirmation_status=confirmation_status,
        )


def get_solana_tip_receipt_provider(
    settings: Settings = Depends(get_settings),
) -> TipReceiptProvider:
    return SolanaTipReceiptProvider(settings.solana_rpc_url)
