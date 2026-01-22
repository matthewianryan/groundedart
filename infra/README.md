# `infra`

Deployment, environment, and observability configuration.

Examples of what belongs here:
- Infrastructure-as-code (hosting, DB, storage, queues)
- Environment variable templates and secrets handling approach
- Observability setup (tracing/metrics/logging configuration)

Product logic should not live in `infra`.

## Local development

Start Postgres + PostGIS:
- `docker compose -f infra/docker-compose.yml up -d db`

