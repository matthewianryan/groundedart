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

Seed nodes (included in Alembic migrations).

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

## Manual M2 capture + upload testing (mobile + throttling)

Prereqs:
- API + web app running.
- `VITE_GOOGLE_MAPS_API_KEY` set (map loads).

Happy path (desktop or mobile browser):
1. Open the web app, select a node marker, and use browser location spoofing to move inside the node radius (Chrome: DevTools → Sensors → Location).
2. Click **Check in** and confirm a token appears.
3. Use the file input to select a photo (or take a photo on mobile).
4. Confirm the UI reports “Uploaded.” and note the capture id.

Failure modes to verify:
- **Retry-only upload**: start an upload with DevTools network throttling (e.g., “Slow 3G”), then toggle **Offline** mid-upload. The upload should fail. Go back online and re-select the same file to retry (full re-upload; no partial resume).
- **Resume scope (not supported in M2)**: if the connection drops, the upload restarts from byte 0. There is no chunked or offset resume.
- **Offline intent**: if you go offline before check-in or capture creation, the flow should fail immediately. If you go offline after creating the capture but before upload finishes, the capture exists without an image and must be re-uploaded manually once online (no persisted background resume in M2).

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
