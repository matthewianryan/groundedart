from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any

from opentelemetry import trace
from opentelemetry.trace.status import Status, StatusCode

from groundedart_api.domain.errors import AppError
from groundedart_api.observability import metrics

_tracer = trace.get_tracer("groundedart_api")


@asynccontextmanager
async def observe_operation(
    operation: str,
    *,
    attributes: dict[str, Any] | None = None,
) -> Iterator[None]:
    start = time.perf_counter()
    outcome = "success"
    error_code = ""
    with _tracer.start_as_current_span(f"ga.{operation}") as span:
        if attributes:
            for key, value in attributes.items():
                if value is None:
                    continue
                span.set_attribute(key, value)
        try:
            yield
        except AppError as exc:
            outcome = "error"
            error_code = exc.code
            span.set_attribute("app.error_code", exc.code)
            span.set_status(Status(StatusCode.ERROR, description=exc.code))
            raise
        except Exception as exc:  # noqa: BLE001
            outcome = "error"
            error_code = "unhandled_exception"
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR))
            raise
        finally:
            duration = time.perf_counter() - start
            metrics.operation_total.labels(
                operation=operation, outcome=outcome, error_code=error_code
            ).inc()
            metrics.operation_duration_seconds.labels(operation=operation, outcome=outcome).observe(
                duration
            )


@contextmanager
def observe_transition(
    *,
    from_state: str,
    to_state: str,
    actor_type: str,
    attributes: dict[str, Any] | None = None,
) -> Iterator[None]:
    outcome = "success"
    with _tracer.start_as_current_span("ga.capture_transition") as span:
        span.set_attribute("capture.from_state", from_state)
        span.set_attribute("capture.to_state", to_state)
        span.set_attribute("capture.actor_type", actor_type)
        if attributes:
            for key, value in attributes.items():
                if value is None:
                    continue
                span.set_attribute(key, value)
        try:
            yield
        except Exception as exc:  # noqa: BLE001
            outcome = "error"
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR))
            raise
        finally:
            metrics.capture_transition_total.labels(
                from_state=from_state,
                to_state=to_state,
                actor_type=actor_type,
                outcome=outcome,
            ).inc()

