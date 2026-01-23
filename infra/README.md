# `infra`

Deployment, environment, and observability configuration.

Examples of what belongs here:
- Infrastructure-as-code (hosting, DB, storage, queues)
- Environment variable templates and secrets handling approach
- Observability setup (tracing/metrics/logging configuration)

Product logic should not live in `infra`.

## Local development

Start Postgres + PostGIS + API + web:
- `docker compose -f infra/docker-compose.yml up --build -d`
