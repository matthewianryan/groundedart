# Commands

Canonical commands for common workflows. Run from the repo root unless noted.

## Bring everything up (build + run)

```bash
docker compose -f infra/docker-compose.yml up --build
```

Notes:
- The `migrate` container applies Alembic migrations and then runs the seed scripts (`seed_nodes.py`, `seed_artists.py`, `seed_node_images.py`) so tips work in a fresh DB and node images are available.
- The `web` container auto-runs `npm ci` if `node_modules/` is missing or out of sync with `package-lock.json`.

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

Ensure the Postgres container is running (default is `infra/docker-compose.yml` and `DATABASE_URL` in `.env`):

```bash
docker compose -f infra/docker-compose.yml up -d db
```

```bash
cd apps/api
alembic -c alembic.ini upgrade head
```

Notes:
- Alembic reads `DATABASE_URL` from the repo root `.env` (default `localhost:5432`, matching `infra/docker-compose.yml`).
- If you’re using the top-level `docker-compose.yml` (default DB port `5433`), update `DATABASE_URL` to use `localhost:5433`.

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

## Solana tip demo (devnet)

Prereqs:
- API + web app running.
- Migrations applied (nodes are seeded via Alembic).

Start here (contract + setup checklist): `docs/TIPS_DEVNET.md`

Quick start (bootstraps devnet wallet + seed data, then runs compose):

```bash
./scripts/dev_up.sh
```

Env vars (for tips):
- `SOLANA_RPC_URL` for the API (devnet RPC).
- `VITE_SOLANA_RPC_URL` for the web wallet adapter (same devnet RPC; optional if using defaults).
- `VITE_TIPS_ENABLED=true` to show the tip UI in the web app.
- Cluster: **devnet only**. If either RPC points at non-devnet, the demo tip loop will fail.

Important:
- The recipient pubkeys in `data/seed/artists.json` are **demo placeholders** (addresses only). They do not confer control of funds.
- Sending a tip requires a **devnet wallet you control** (because the transfer + memo must be signed).

Seed a demo artist recipient pubkey:
1. Bootstrap a devnet wallet + seed data (interactive):

```bash
./scripts/solana_devnet_bootstrap.sh
```

Non-interactive example:

```bash
./scripts/solana_devnet_bootstrap.sh --pubkey <DEVNET_PUBKEY> --artist-id <ARTIST_UUID> --seed-db
```

Alternative manual steps:
- Create or copy a devnet wallet pubkey (Phantom/Solflare, or `solana-keygen new`).
- Update `data/seed/artists.json` with that pubkey and the node id(s) to receive tips (use ids from `data/seed/nodes.json`).
- Seed the DB:

```bash
cd apps/api
python scripts/seed_artists.py
```

Fund demo wallets with devnet SOL:
- CLI: `solana airdrop 2 <PUBKEY> --url devnet`
- Web faucet: https://faucet.solana.com/ (devnet)

Run the tip receipt reconciler (separate terminal):

```bash
cd apps/api
python scripts/reconcile_tip_receipts.py --loop
```

RPC commitment levels:
- Tip confirm uses `confirmed` for fast feedback; receipts may still be non-final.
- Reconciliation polls with `finalized` to upgrade receipt status once finality lands.

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

open -a Docker
for i in {1..30}; do docker info >/dev/null 2>&1 && break || sleep 2; done
docker compose -f infra/docker-compose.yml up -d db
source .venv311/bin/activate
set -a && source .env && set +a
cd apps/api
python scripts/ensure_database.py
alembic upgrade head

mkdir -p /tmp/docker-config/cli-plugins
ln -sf ~/.docker/cli-plugins/docker-compose /tmp/docker-config/cli-plugins/docker-compose
printf '{"auths":{}, "currentContext":"desktop-linux"}\n' > /tmp/docker-config/config.json
mkdir -p /tmp/docker-config/contexts
rsync -a ~/.docker/contexts/ /tmp/docker-config/contexts/

open -a Docker
for i in {1..30}; do docker info >/dev/null 2>&1 && break || sleep 2; done
DOCKER_CONFIG=/tmp/docker-config docker compose -f infra/docker-compose.yml up -d db

source .venv311/bin/activate
set -a && source .env && set +a
cd apps/api
python scripts/ensure_database.py
alembic upgrade head
