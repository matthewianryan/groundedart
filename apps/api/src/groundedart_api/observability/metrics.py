from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

operation_total = Counter(
    "ga_operation_total",
    "Count of critical operations.",
    labelnames=("operation", "outcome", "error_code"),
)
operation_duration_seconds = Histogram(
    "ga_operation_duration_seconds",
    "Duration of critical operations in seconds.",
    labelnames=("operation", "outcome"),
    buckets=(
        0.005,
        0.01,
        0.025,
        0.05,
        0.1,
        0.25,
        0.5,
        1.0,
        2.5,
        5.0,
        10.0,
    ),
)

capture_transition_total = Counter(
    "ga_capture_transition_total",
    "Count of capture state transitions.",
    labelnames=("from_state", "to_state", "actor_type", "outcome"),
)

upload_bytes_total = Counter(
    "ga_upload_bytes_total",
    "Total uploaded bytes.",
    labelnames=("mime", "outcome"),
)


def render_metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

