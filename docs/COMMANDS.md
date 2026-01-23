# Commands

Canonical commands for common workflows. Run from the repo root unless noted.

## Bring everything up (build + run)

```bash
docker compose -f infra/docker-compose.yml up --build -d
```

## Essentials (dependencies + hydration)

Activate the API virtualenv once per shell:

```bash
source .venv311/bin/activate
```

Install web dependencies (run once or when `package.json` changes):

```bash
cd apps/web
npm install
```

Seed nodes (run after migrations when you want sample data):

```bash
cd apps/api
python scripts/seed_nodes.py
```

## Alembic migrations (exact sequence)

```bash
cd apps/api
alembic -c alembic.ini upgrade head
```

## Run the API server

```bash
cd apps/api
uvicorn groundedart_api.main:app --reload --port 8000
```

## Run the web app

```bash
cd apps/web
npm run dev
```

## Run API tests

```bash
cd apps/api
pytest
```

## Reset the DB volume (deletes all local DB data)

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
```
