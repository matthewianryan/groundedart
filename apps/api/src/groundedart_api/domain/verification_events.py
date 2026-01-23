from __future__ import annotations

import uuid
from typing import Annotated, Protocol

from fastapi import Depends


class VerificationEventEmitter(Protocol):
    async def capture_uploaded(
        self,
        capture_id: uuid.UUID,
        node_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        ...

    async def capture_state_changed(
        self,
        capture_id: uuid.UUID,
        from_state: str,
        to_state: str,
        reason_code: str | None,
    ) -> None:
        ...


class NoopVerificationEventEmitter:
    async def capture_uploaded(
        self,
        capture_id: uuid.UUID,
        node_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        return None

    async def capture_state_changed(
        self,
        capture_id: uuid.UUID,
        from_state: str,
        to_state: str,
        reason_code: str | None,
    ) -> None:
        return None


_noop_emitter = NoopVerificationEventEmitter()


def get_verification_event_emitter() -> VerificationEventEmitter:
    return _noop_emitter


VerificationEventEmitterDep = Annotated[
    VerificationEventEmitter, Depends(get_verification_event_emitter)
]
