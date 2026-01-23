from __future__ import annotations

import datetime as dt
import re
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select

from groundedart_api.api.schemas import (
    ConfirmTipRequest,
    CreateTipIntentRequest,
    NodeTipsResponse,
    TipIntentResponse,
    TipReceiptPublic,
)
from groundedart_api.auth.deps import CurrentUser
from groundedart_api.db.models import Artist, Node, TipIntent, TipReceipt
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.errors import AppError
from groundedart_api.domain.tip_receipts import (
    TipReceiptFailureReason,
    TipReceiptProvider,
    TipReceiptVerificationFailure,
)
from groundedart_api.domain.tip_receipts_solana import get_solana_tip_receipt_provider
from groundedart_api.settings import Settings, get_settings
from groundedart_api.time import UtcNow, get_utcnow

router = APIRouter(prefix="/v1", tags=["tips"])

_PUBKEY_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_MEMO_PREFIX = "ga_tip_intent:"
_CLUSTER = "devnet"
_LAMPORTS_PER_SOL = Decimal("1000000000")
_TOTAL_STATUSES = ("confirmed", "finalized")


def _is_valid_pubkey(value: str) -> bool:
    return bool(_PUBKEY_RE.match(value))


def _build_memo_text(tip_intent_id: uuid.UUID) -> str:
    return f"{_MEMO_PREFIX}{tip_intent_id}"


def _receipt_public(receipt: TipReceipt) -> TipReceiptPublic:
    return TipReceiptPublic(
        tip_intent_id=receipt.tip_intent_id,
        tx_signature=receipt.tx_signature,
        from_pubkey=receipt.from_pubkey,
        to_pubkey=receipt.to_pubkey,
        amount_lamports=receipt.amount_lamports,
        slot=receipt.slot,
        block_time=receipt.block_time,
        confirmation_status=receipt.confirmation_status,
        first_seen_at=receipt.first_seen_at,
        last_checked_at=receipt.last_checked_at,
        failure_reason=receipt.failure_reason,
    )


def _format_sol_from_lamports(amount_lamports: int) -> str:
    sol_amount = Decimal(amount_lamports) / _LAMPORTS_PER_SOL
    return format(sol_amount.quantize(Decimal("0.000000001")), "f")


@router.post("/tips/intents", response_model=TipIntentResponse)
async def create_tip_intent(
    payload: CreateTipIntentRequest,
    db: DbSessionDep,
    user: CurrentUser,
    settings: Settings = Depends(get_settings),
    now: UtcNow = Depends(get_utcnow),
) -> TipIntentResponse:
    if payload.amount_lamports <= 0:
        raise AppError(
            code="invalid_tip_amount",
            message="Invalid tip amount",
            status_code=400,
            details={"amount_lamports": payload.amount_lamports},
        )

    node = await db.get(Node, payload.node_id)
    if node is None:
        raise AppError(code="node_not_found", message="Node not found", status_code=404)
    if node.default_artist_id is None:
        raise AppError(
            code="node_missing_default_artist",
            message="Node is missing a default artist",
            status_code=400,
            details={"node_id": str(node.id)},
        )

    artist = await db.get(Artist, node.default_artist_id)
    if artist is None or not _is_valid_pubkey(artist.solana_recipient_pubkey):
        raise AppError(
            code="artist_missing_recipient_pubkey",
            message="Artist recipient pubkey is missing or invalid",
            status_code=400,
            details={"artist_id": str(node.default_artist_id)},
        )

    tip_intent_id = uuid.uuid4()
    memo_text = _build_memo_text(tip_intent_id)
    expires_at = now() + dt.timedelta(seconds=settings.tip_intent_ttl_seconds)

    tip_intent = TipIntent(
        id=tip_intent_id,
        node_id=node.id,
        artist_id=node.default_artist_id,
        amount_lamports=payload.amount_lamports,
        to_pubkey=artist.solana_recipient_pubkey,
        created_by_user_id=user.id,
        expires_at=expires_at,
        status="open",
    )
    db.add(tip_intent)
    await db.commit()

    return TipIntentResponse(
        tip_intent_id=tip_intent_id,
        to_pubkey=artist.solana_recipient_pubkey,
        amount_lamports=payload.amount_lamports,
        cluster=_CLUSTER,
        memo_text=memo_text,
    )


@router.post("/tips/confirm", response_model=TipReceiptPublic)
async def confirm_tip(
    payload: ConfirmTipRequest,
    db: DbSessionDep,
    user: CurrentUser,
    provider: TipReceiptProvider = Depends(get_solana_tip_receipt_provider),
    now: UtcNow = Depends(get_utcnow),
) -> TipReceiptPublic:
    tip_intent = await db.get(TipIntent, payload.tip_intent_id)
    if tip_intent is None:
        raise AppError(
            code="tip_intent_not_found",
            message="Tip intent not found",
            status_code=404,
        )

    existing_receipt = await db.scalar(
        select(TipReceipt).where(TipReceipt.tip_intent_id == payload.tip_intent_id)
    )
    if existing_receipt:
        if existing_receipt.tx_signature != payload.tx_signature:
            raise AppError(
                code="tip_intent_already_confirmed",
                message="Tip intent already confirmed",
                status_code=409,
            )
        return _receipt_public(existing_receipt)

    existing_signature = await db.scalar(
        select(TipReceipt).where(TipReceipt.tx_signature == payload.tx_signature)
    )
    if existing_signature:
        raise AppError(
            code="tx_signature_already_used",
            message="Transaction signature already used",
            status_code=409,
        )

    now_at = now()
    if now_at >= tip_intent.expires_at or tip_intent.status != "open":
        receipt = TipReceipt(
            tip_intent_id=payload.tip_intent_id,
            tx_signature=payload.tx_signature,
            from_pubkey=None,
            to_pubkey=tip_intent.to_pubkey,
            amount_lamports=tip_intent.amount_lamports,
            slot=None,
            block_time=None,
            confirmation_status="failed",
            first_seen_at=now_at,
            last_checked_at=now_at,
            failure_reason=TipReceiptFailureReason.INTENT_EXPIRED,
        )
        db.add(receipt)
        await db.commit()
        return _receipt_public(receipt)

    verification = await provider.verify_tip_receipt(
        tip_intent_id=payload.tip_intent_id,
        tx_signature=payload.tx_signature,
        expected_to_pubkey=tip_intent.to_pubkey,
        expected_amount_lamports=tip_intent.amount_lamports,
    )

    if isinstance(verification, TipReceiptVerificationFailure):
        receipt = TipReceipt(
            tip_intent_id=payload.tip_intent_id,
            tx_signature=payload.tx_signature,
            from_pubkey=None,
            to_pubkey=tip_intent.to_pubkey,
            amount_lamports=tip_intent.amount_lamports,
            slot=verification.slot,
            block_time=verification.block_time,
            confirmation_status="failed",
            first_seen_at=now_at,
            last_checked_at=now_at,
            failure_reason=verification.reason,
        )
        db.add(receipt)
        await db.commit()
        return _receipt_public(receipt)

    receipt = TipReceipt(
        tip_intent_id=payload.tip_intent_id,
        tx_signature=payload.tx_signature,
        from_pubkey=verification.from_pubkey,
        to_pubkey=verification.to_pubkey,
        amount_lamports=verification.amount_lamports,
        slot=verification.slot,
        block_time=verification.block_time,
        confirmation_status=verification.confirmation_status,
        first_seen_at=now_at,
        last_checked_at=now_at,
        failure_reason=None,
    )
    db.add(receipt)
    await db.commit()
    return _receipt_public(receipt)


@router.get("/nodes/{node_id}/tips", response_model=NodeTipsResponse)
async def get_node_tips(node_id: uuid.UUID, db: DbSessionDep) -> NodeTipsResponse:
    """Return node tip totals (confirmed + finalized only) and recent receipts."""
    node = await db.get(Node, node_id)
    if node is None:
        raise AppError(code="node_not_found", message="Node not found", status_code=404)

    total_query = (
        select(func.coalesce(func.sum(TipReceipt.amount_lamports), 0))
        .select_from(TipReceipt)
        .join(TipIntent, TipReceipt.tip_intent_id == TipIntent.id)
        .where(
            TipIntent.node_id == node_id,
            TipReceipt.confirmation_status.in_(_TOTAL_STATUSES),
        )
    )
    total_amount_lamports = int(await db.scalar(total_query) or 0)

    receipts_query = (
        select(TipReceipt)
        .join(TipIntent, TipReceipt.tip_intent_id == TipIntent.id)
        .where(TipIntent.node_id == node_id)
        .order_by(desc(TipReceipt.first_seen_at))
        .limit(10)
    )
    receipts = (await db.scalars(receipts_query)).all()

    return NodeTipsResponse(
        node_id=node_id,
        total_amount_lamports=total_amount_lamports,
        total_amount_sol=_format_sol_from_lamports(total_amount_lamports),
        recent_receipts=[_receipt_public(receipt) for receipt in receipts],
    )
