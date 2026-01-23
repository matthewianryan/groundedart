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

Verify current revision (optional but useful when `upgrade head` prints only INFO lines):

```bash
cd apps/api
alembic -c alembic.ini current
```

List available revisions:

```bash
cd apps/api
alembic -c alembic.ini history
```

## Run the API server

```bash
cd apps/api
uvicorn groundedart_api.main:app --reload --port 8000
```

## Admin moderation (API-only)

Prereqs:
- API server running.
- `ADMIN_API_TOKEN` set (matches `.env`).

List pending captures:

```bash
cd apps/api
python scripts/admin_list_pending_captures.py --limit 50
```

List abuse events:

```bash
cd apps/api
python scripts/admin_list_abuse_events.py --limit 50
```

Optional: set `GROUNDEDART_API_BASE_URL` for non-local endpoints.

## Run the web app

```bash
cd apps/web
npm run dev
```

## Manual M2 weak-network checklist (mobile + throttling)

Prereqs:
- API + web app running.
- `VITE_GOOGLE_MAPS_API_KEY` set (map loads).

Checklist A — Happy path capture:
1. Open the web app on mobile (or desktop with device emulation).
2. Select a node marker and spoof location inside the node radius (Chrome: DevTools → Sensors → Location).
3. Tap **Check in** and confirm the check-in succeeds.
4. Tap **Take photo**, capture an image, and **Submit**.
5. Confirm the UI shows "Upload complete" and the capture is marked pending review.

Checklist B — Weak network recovery (failed upload without recapture):
1. Start another capture and submit it.
2. While the upload is in progress, enable network throttling (e.g., "Slow 3G") and toggle **Offline** mid-upload.
3. Confirm the upload fails and the capture shows a retry prompt.
4. Reload the page while still offline; verify a "Pending uploads" section lists the failed capture.
5. Go back online and use **Retry** or **Retry failed**. Confirm the upload succeeds without taking a new photo.

Checklist C — Intent survives reload/offline:
1. Start a capture, submit it, and wait until the upload is queued (not yet complete).
2. Immediately reload the page (or close/reopen the tab).
3. Confirm the pending upload is still listed and resumes once you reconnect.
4. Verify the capture completes with the same capture id (no duplicate capture created).

Notes:
- Uploads are retry-only in M2 (no chunked/offset resume; retries restart from byte 0).
- Going offline before check-in or capture creation should fail immediately; going offline after capture creation leaves a pending upload that must be retried once online.

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
