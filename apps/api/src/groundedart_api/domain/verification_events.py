from __future__ import annotations

import datetime as dt
import logging
import uuid
from typing import Annotated, Protocol

from fastapi import Depends
import httpx

from groundedart_api.settings import Settings, get_settings


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


class LoggingVerificationEventEmitter:
    def __init__(self) -> None:
        self._logger = logging.getLogger("groundedart_api.verification_events")

    async def capture_uploaded(
        self,
        capture_id: uuid.UUID,
        node_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        self._logger.info(
            "verification_event",
            extra={
                "event_type": "capture_uploaded",
                "capture_id": str(capture_id),
                "node_id": str(node_id),
                "user_id": str(user_id),
            },
        )

    async def capture_state_changed(
        self,
        capture_id: uuid.UUID,
        from_state: str,
        to_state: str,
        reason_code: str | None,
    ) -> None:
        self._logger.info(
            "verification_event",
            extra={
                "event_type": "capture_state_changed",
                "capture_id": str(capture_id),
                "from_state": from_state,
                "to_state": to_state,
                "reason_code": reason_code,
            },
        )


class WebhookVerificationEventEmitter:
    def __init__(self, settings: Settings) -> None:
        if settings.verification_events_webhook_url is None:
            raise ValueError("verification_events_webhook_url is required for webhook mode")
        self._url = str(settings.verification_events_webhook_url)
        self._token = settings.verification_events_webhook_token
        self._timeout = float(settings.verification_events_webhook_timeout_seconds)
        self._logger = logging.getLogger("groundedart_api.verification_events")

    async def capture_uploaded(
        self,
        capture_id: uuid.UUID,
        node_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        await self._emit(
            {
                "schema_version": 1,
                "event_type": "capture_uploaded",
                "sent_at": dt.datetime.now(dt.UTC).isoformat(),
                "capture_id": str(capture_id),
                "node_id": str(node_id),
                "user_id": str(user_id),
            }
        )

    async def capture_state_changed(
        self,
        capture_id: uuid.UUID,
        from_state: str,
        to_state: str,
        reason_code: str | None,
    ) -> None:
        await self._emit(
            {
                "schema_version": 1,
                "event_type": "capture_state_changed",
                "sent_at": dt.datetime.now(dt.UTC).isoformat(),
                "capture_id": str(capture_id),
                "from_state": from_state,
                "to_state": to_state,
                "reason_code": reason_code,
            }
        )

    async def _emit(self, payload: dict[str, object]) -> None:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._token:
            headers["X-GroundedArt-Webhook-Token"] = self._token
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(self._url, json=payload, headers=headers)
                response.raise_for_status()
        except httpx.HTTPError:
            self._logger.exception(
                "verification_event_webhook_failed",
                extra={
                    "webhook_url": self._url,
                    **payload,
                },
            )


_noop_emitter = NoopVerificationEventEmitter()
_log_emitter = LoggingVerificationEventEmitter()


def get_verification_event_emitter(
    settings: Settings = Depends(get_settings),
) -> VerificationEventEmitter:
    mode = settings.verification_events_mode
    if mode == "noop":
        return _noop_emitter
    if mode == "webhook":
        return WebhookVerificationEventEmitter(settings)
    return _log_emitter


VerificationEventEmitterDep = Annotated[
    VerificationEventEmitter, Depends(get_verification_event_emitter)
]
