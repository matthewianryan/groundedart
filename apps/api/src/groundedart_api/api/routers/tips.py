from __future__ import annotations

import datetime as dt
import re
import uuid

from fastapi import APIRouter, Depends

from groundedart_api.api.schemas import CreateTipIntentRequest, TipIntentResponse
from groundedart_api.auth.deps import CurrentUser
from groundedart_api.db.models import Artist, Node, TipIntent
from groundedart_api.db.session import DbSessionDep
from groundedart_api.domain.errors import AppError
from groundedart_api.settings import Settings, get_settings
from groundedart_api.time import UtcNow, get_utcnow

router = APIRouter(prefix="/v1", tags=["tips"])

_PUBKEY_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_MEMO_PREFIX = "ga_tip_intent:"
_CLUSTER = "devnet"


def _is_valid_pubkey(value: str) -> bool:
    return bool(_PUBKEY_RE.match(value))


def _build_memo_text(tip_intent_id: uuid.UUID) -> str:
    return f"{_MEMO_PREFIX}{tip_intent_id}"


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
