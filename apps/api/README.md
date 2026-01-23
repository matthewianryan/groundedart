# `apps/api`

Core API service.

Responsibilities:
- Authoritative geofence verification and short-lived check-in tokens
- Capture record creation and verification state transitions
- Rank computation (or rank event ingestion) and feature gating
- Signed media access (scoped URLs) and abuse protections (rate limits/audit)

Notes:
- Media scoring/similarity is often best as async jobs; it can live here initially but should be separable as a worker.

## Local development

Prereqs:
- Python 3.11
- Docker (for Postgres/PostGIS)

Start the database:
- `docker compose -f infra/docker-compose.yml up -d db`

Install the API (from repo root):
- `python3.11 -m venv .venv311` (first time)
- `source .venv311/bin/activate`
- `pip install -e "apps/api[dev]"`

Run migrations (includes seed nodes):
- `cd apps/api && alembic upgrade head`

Run the API:
- `uvicorn groundedart_api.main:app --reload --port 8000`

## Observability

- **Request IDs**: every response includes `X-Request-ID` (echoed if provided by the client).
- **Structured logs**: set `LOG_FORMAT=json` (default) and `LOG_LEVEL=INFO` to control output.
- **Metrics**: Prometheus scrape endpoint at `GET /metrics`.
- **Tracing (optional)**: set `GA_OTEL_ENABLED=1` to emit spans (defaults to console exporter), or set `OTEL_EXPORTER_OTLP_ENDPOINT` to export via OTLP/HTTP.
