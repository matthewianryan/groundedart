from __future__ import annotations

import datetime as dt
import json
import logging
import os
import traceback
from typing import Any

from groundedart_api.observability.context import get_request_id

_CONFIGURED = False


def _get_trace_context() -> tuple[str | None, str | None]:
    try:
        from opentelemetry.trace import get_current_span
    except Exception:  # noqa: BLE001
        return None, None

    span = get_current_span()
    context = span.get_span_context()
    if not context or not context.is_valid:
        return None, None
    return f"{context.trace_id:032x}", f"{context.span_id:016x}"


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        trace_id, span_id = _get_trace_context()
        record.trace_id = trace_id
        record.span_id = span_id
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": dt.datetime.now(dt.UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        trace_id = getattr(record, "trace_id", None)
        if trace_id:
            payload["trace_id"] = trace_id
        span_id = getattr(record, "span_id", None)
        if span_id:
            payload["span_id"] = span_id

        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__
            payload["exc"] = "".join(traceback.format_exception(*record.exc_info)).rstrip()

        skip = {
            "name",
            "msg",
            "args",
            "levelname",
            "levelno",
            "pathname",
            "filename",
            "module",
            "exc_info",
            "exc_text",
            "stack_info",
            "lineno",
            "funcName",
            "created",
            "msecs",
            "relativeCreated",
            "thread",
            "threadName",
            "processName",
            "process",
            "request_id",
            "trace_id",
            "span_id",
        }
        for key, value in record.__dict__.items():
            if key in skip:
                continue
            if value is None:
                continue
            payload[key] = value

        return json.dumps(payload, default=str)


def configure_logging(*, default_level: str = "INFO") -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    level = os.getenv("LOG_LEVEL", default_level).upper()
    log_format = os.getenv("LOG_FORMAT", "json").lower()

    handler: logging.Handler = logging.StreamHandler()
    if log_format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
    handler.addFilter(RequestContextFilter())

    base = logging.getLogger("groundedart_api")
    base.setLevel(level)
    base.propagate = False
    if not base.handlers:
        base.addHandler(handler)

    _CONFIGURED = True


def access_log(event: dict[str, object]) -> None:
    logging.getLogger("groundedart_api.access").info("http_request", extra=event)
