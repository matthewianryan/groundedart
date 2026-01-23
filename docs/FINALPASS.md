# Final Pass (Hackathon Submission)

This is the last-mile checklist to ensure the Grounded Art demo is **usable by real users** with **no dead ends**, **no broken flows**, and **no “wired later” UI**.

Scope: the currently implemented core loop in this repo:
**Map → node selection → on-site check-in → capture + upload → admin verification → (optional) auto-publish → view + report.**

---

## 0) Stop-Ship (non‑negotiables)

- [ ] A first-time user can load the web app and see a map (not a blank screen).
- [ ] Anonymous session is established automatically (cookie set) and API requests work.
- [ ] Nodes render on the map + “Nodes in view” list updates without errors.
- [ ] A user can select a node and open **Node detail**.
- [ ] **Check in** succeeds when inside geofence and returns a token.
- [ ] **Take photo → Submit** creates a capture and uploads an image successfully.
- [ ] Uploads survive **offline + reload** (pending uploads list persists and can be retried).
- [ ] Admin can verify a pending capture and the user sees a **notification**.
- [ ] If “Publish automatically once verified” is checked **and** attribution/rights are provided, the verified capture becomes **public** and appears in **Node detail**.
- [ ] Reporting works end-to-end: user reports → admin resolves → capture is hidden and no longer appears publicly.
- [ ] There are **no visible UI paths** for unfinished features (tips, login/identity, feeds, etc).

If any item above fails: stop and fix before demo/submission.

---

## 1) Environment & Secrets (must be correct)

### Required local values (`.env` at repo root)
- [ ] `VITE_GOOGLE_MAPS_API_KEY` set and valid.
- [ ] `VITE_API_ORIGIN` points at the running API (default `http://localhost:8000`).
- [ ] `API_CORS_ORIGINS` includes the web origin (default `http://localhost:5173`).
- [ ] `DATABASE_URL` points at the running Postgres/PostGIS.
- [ ] `TOKEN_HASH_SECRET` is set (non-empty); do not ship the default in a deployed demo.
- [ ] `ADMIN_API_TOKEN` is set (non-empty); keep it private.

### Google Maps Platform key checks
- [ ] Billing enabled for the project.
- [ ] APIs enabled: Maps JavaScript API, Directions API, Places API, Geocoding API.
- [ ] Key restrictions include your demo origins:
  - Local: `http://localhost:5173/*`
  - Deployed: your real web domain(s)

### Cookie + CORS deployment reality check (critical)
The app uses a **cookie session** (`ga_session`) with `SameSite=Lax`.
- [ ] The web app domain and API domain are **same-site** (e.g. `app.example.com` and `api.example.com`).
- [ ] `API_CORS_ORIGINS` matches the web origin exactly (scheme + host + port).
- [ ] In the browser, confirm the cookie is being sent on API calls (`credentials: include`).

If your API and web are on unrelated domains, the session cookie will not behave as expected; do not “hope it works”.

---

## 2) “From Scratch” Bring-up (fresh machine sanity)

### One-command local bring-up
- [ ] `docker compose -f infra/docker-compose.yml up --build -d`
- [ ] Web at `http://localhost:5173`
- [ ] API at `http://localhost:8000`
- [ ] `GET http://localhost:8000/health` returns `{"status":"ok"}`

### Seed data present (nodes)
- [ ] Map shows seeded nodes in Cape Town once the map loads.
- [ ] If nodes are missing, run migrations (seed nodes are included in Alembic migrations):
  - `cd apps/api && alembic -c alembic.ini upgrade head`

---

## 3) Automated Checks (must pass)

### API (Python)
- [ ] `source .venv311/bin/activate`
- [ ] `pip install -e "apps/api[dev]"`
- [ ] `cd apps/api && ruff check .`
- [ ] `cd apps/api && pytest`

### Web (Vite/React)
- [ ] `cd apps/web && npm ci` (or `npm install` if you’re iterating)
- [ ] `cd apps/web && npm test`
- [ ] `cd apps/web && npm run build`

---

## 4) API Smoke (quick contract checks)

Use these to debug without the web UI.

### Health
- [ ] `curl -s http://localhost:8000/health`

### Anonymous session (cookie set)
- [ ] `curl -i -s -X POST http://localhost:8000/v1/sessions/anonymous -H 'Content-Type: application/json' -d '{\"device_id\":\"00000000-0000-0000-0000-000000000000\"}' | rg -n 'set-cookie|ga_session|user_id'`

### Nodes list (bbox around Cape Town CBD)
- [ ] `curl -s 'http://localhost:8000/v1/nodes?bbox=18.40,-33.94,18.44,-33.90' | rg -n 'nodes|name'`

### Admin: list pending captures
- [ ] `curl -s -H \"X-Admin-Token: $ADMIN_API_TOKEN\" 'http://localhost:8000/v1/admin/captures/pending?limit=10'`

---

## 5) Web Demo Flows (manual QA)

Run these in a clean browser profile (no cached service workers/extensions), ideally Chrome + one mobile browser.

### A) Map-first browsing
- [ ] Map loads and stays interactive (no infinite “Loading Google Maps…”).
- [ ] “Nodes in view” count matches visible markers in the viewport.
- [ ] Selecting a marker updates the right panel with node name/category/description.
- [ ] **Open detail** navigates to `/nodes/:nodeId` and shows node metadata.

### B) Directions
- [ ] Clicking **Directions** draws a route from current location to the node.
- [ ] If location permission is denied, the UI fails clearly (no silent hang).

### C) Check-in (proof-of-presence)
- [ ] Clicking **Check in** requests location permission.
- [ ] With a location inside the radius, check-in succeeds and a token appears.
- [ ] Outside the radius: user sees a clear “outside geofence” failure and retry works.
- [ ] Low accuracy (above `MAX_LOCATION_ACCURACY_M`): user sees the accuracy error and next-step guidance.

Tip for rehearsal (remote demo): spoof location in Chrome:
DevTools → More tools → Sensors → Location → set lat/lng inside the node radius.

Suggested seeded node for spoofing:
- Zeitz Museum of Contemporary Art Africa: `lat=-33.9075`, `lng=18.4231`, `radius=120m` (`data/seed/nodes.json`)

### D) Capture + upload (happy path)
- [ ] Click **Take photo** (requires a check-in token).
- [ ] Capture preview shows (image preprocess completes).
- [ ] Fill attribution fields + select rights basis + check rights attestation.
- [ ] Check “Publish automatically once verified…”.
- [ ] Click **Submit**:
  - capture is created (no “Missing check-in token”).
  - upload progresses and finishes (“Upload complete”).
  - user returns to map; pending uploads are empty.

### E) Upload resilience (offline + reload)
- [ ] Start a capture and submit it.
- [ ] While uploading, toggle offline (DevTools Network → Offline).
- [ ] UI shows offline state and the capture appears under **Pending uploads**.
- [ ] Reload the page while still offline:
  - pending upload still listed.
- [ ] Go back online:
  - use **Retry** / **Retry failed** and confirm it completes without re-taking the photo.

### F) Verification → notification → public visibility
This requires admin action.

- [ ] After upload, copy the capture id from the URL `/capture/<captureId>`.
- [ ] Admin transitions it to verified:
  - `curl -s -X POST \"http://localhost:8000/v1/admin/captures/<captureId>/transition\" -H \"X-Admin-Token: $ADMIN_API_TOKEN\" -H 'Content-Type: application/json' -d '{\"target_state\":\"verified\",\"reason_code\":\"manual\"}'`
- [ ] In the web app, the user sees a new notification:
  - “Capture verified & published” if fields were complete and auto-publish was requested.
  - Otherwise “Capture verified” plus “Missing to publish: …”.
- [ ] If published:
  - Node detail now shows the capture image under “Verified captures”.
  - The capture includes attribution/source display.

### G) Report + takedown (rights posture)
- [ ] On Node detail, click **Report** on a publicly visible capture.
- [ ] Submit a report and confirm the UI shows “Reported”.
- [ ] Admin lists reports:
  - `curl -s -H \"X-Admin-Token: $ADMIN_API_TOKEN\" 'http://localhost:8000/v1/admin/reports?resolved=false&limit=10'`
- [ ] Admin resolves with `hide_capture`:
  - `curl -s -X POST \"http://localhost:8000/v1/admin/reports/<reportId>/resolve\" -H \"X-Admin-Token: $ADMIN_API_TOKEN\" -H 'Content-Type: application/json' -d '{\"resolution\":\"hide_capture\"}'`
- [ ] Capture no longer appears publicly in node captures.

---

## 6) Observability (demo debugging essentials)

- [ ] API responses include `X-Request-ID` (use it to correlate UI failures with logs).
- [ ] `GET /metrics` responds (Prometheus text format).
- [ ] Logs are readable in the environment you’ll demo from:
  - local: Docker logs or terminal output
  - deployed: your platform log viewer

Optional (if you need deeper debugging):
- `LOG_FORMAT=json` and `LOG_LEVEL=INFO`
- `GA_OTEL_ENABLED=1` (and configure `OTEL_EXPORTER_OTLP_ENDPOINT` if exporting)

---

## 7) Demo Day Runbook (recommended sequence)

Goal: show the full trust loop in ~5–8 minutes without setup drama.

1) Open the web app and show the map + a few seeded nodes.
2) Select a node → show check-in panel and “proof-of-presence” concept.
3) (If remote) spoof location inside the node radius and run **Check in**.
4) **Take photo → Submit**, with attribution + rights + “auto-publish”.
5) In a terminal, admin-verify the capture (one command).
6) Back in the web app, show:
   - notification (“verified & published”)
   - the capture visible in Node detail with attribution
   - rank panel/next unlock (if relevant)
7) (Optional) demonstrate reporting + admin hide to show rights/takedown posture.

Have a fallback:
- [ ] A short screen recording of the full flow (in case Maps key/network fails).

---

## 8) Explicit Non-goals for this submission (keep them out of the UI)

- No user login / account recovery (anonymous device sessions only).
- No tipping/on-chain receipts in the current demo loop.
- No production-grade media access control (local `/media` mount is dev-oriented).
- No async workers/queues for verification (admin-driven for hackathon).

