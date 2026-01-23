from __future__ import annotations

import re
import time
import uuid
from collections.abc import Callable

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from groundedart_api.observability.context import request_id_var
from groundedart_api.observability.tracing import tracing_enabled

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")


def _extract_request_id(scope: Scope) -> str | None:
    headers = scope.get("headers") or []
    for name, value in headers:
        if name == b"x-request-id":
            try:
                decoded = value.decode("utf-8", errors="ignore").strip()
            except Exception:  # noqa: BLE001
                return None
            if decoded and _REQUEST_ID_RE.fullmatch(decoded):
                return decoded
            return None
    return None


class RequestContextMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        header_name: str = "x-request-id",
        access_log: Callable[[dict[str, object]], None] | None = None,
    ) -> None:
        self._app = app
        self._header_name = header_name.lower()
        self._access_log = access_log

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        request_id = _extract_request_id(scope) or str(uuid.uuid4())
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        status_code: int | None = None

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = list(message.get("headers") or [])
                headers.append((self._header_name.encode("ascii"), request_id.encode("ascii")))
                message["headers"] = headers
            await send(message)

        try:
            if tracing_enabled():
                await _call_with_trace(
                    app=self._app,
                    scope=scope,
                    receive=receive,
                    send=send_wrapper,
                    request_id=request_id,
                    get_status_code=lambda: status_code,
                )
            else:
                await self._app(scope, receive, send_wrapper)
        finally:
            duration_ms = (time.perf_counter() - start) * 1000.0
            if self._access_log is not None:
                self._access_log(
                    {
                        "request_id": request_id,
                        "method": scope.get("method"),
                        "path": scope.get("path"),
                        "query_string": (scope.get("query_string") or b"").decode(
                            "utf-8", errors="ignore"
                        ),
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                        "client": (scope.get("client") or [None, None])[0],
                    }
                )
            request_id_var.reset(token)


async def _call_with_trace(
    *,
    app: ASGIApp,
    scope: Scope,
    receive: Receive,
    send: Send,
    request_id: str,
    get_status_code: Callable[[], int | None],
) -> None:
    from opentelemetry import trace
    from opentelemetry.propagate import extract
    from opentelemetry.trace import SpanKind
    from opentelemetry.trace.status import Status, StatusCode

    tracer = trace.get_tracer("groundedart_api")
    carrier: dict[str, str] = {}
    for name, value in (scope.get("headers") or []):
        try:
            carrier[name.decode("ascii", errors="ignore")] = value.decode("utf-8", errors="ignore")
        except Exception:  # noqa: BLE001
            continue
    parent_ctx = extract(carrier)

    method = scope.get("method") or "UNKNOWN"
    path = scope.get("path") or ""
    with tracer.start_as_current_span(
        name=f"{method} {path}",
        context=parent_ctx,
        kind=SpanKind.SERVER,
        attributes={
            "http.method": method,
            "http.target": path,
            "request.id": request_id,
        },
    ) as span:
        try:
            await app(scope, receive, send)
        except Exception as exc:  # noqa: BLE001
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR))
            raise
        finally:
            status_code = get_status_code()
            if status_code is not None:
                span.set_attribute("http.status_code", status_code)
                if 500 <= int(status_code):
                    span.set_status(Status(StatusCode.ERROR))
                else:
                    span.set_status(Status(StatusCode.OK))
