from __future__ import annotations

import os

from fastapi import FastAPI


def tracing_enabled() -> bool:
    flag = os.getenv("GA_OTEL_ENABLED", "").strip().lower()
    if flag in {"1", "true", "yes", "on"}:
        return True
    if os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return True
    return False


def configure_tracing(app: FastAPI) -> None:
    if not tracing_enabled():
        return

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased

    service_name = os.getenv("OTEL_SERVICE_NAME", "groundedart-api")
    sample_ratio = float(os.getenv("OTEL_TRACES_SAMPLER_ARG", "1.0"))
    provider = TracerProvider(
        resource=Resource.create({"service.name": service_name}),
        sampler=ParentBased(TraceIdRatioBased(sample_ratio)),
    )

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if endpoint:
        exporter = OTLPSpanExporter(endpoint=endpoint)
    else:
        exporter = ConsoleSpanExporter()
    provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    _ = app  # Tracer provider only; request spans are created by middleware.
