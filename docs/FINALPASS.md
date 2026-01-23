# FINALPASS — Final Implementations (Repo Snapshot)

This file documents what is **actually implemented** in this repository today (web, API, DB, infra), why it exists, and how the pieces fit together. It’s intended to be a “don’t accidentally break this” reference and a handoff document for demo/ops.

Core loop implemented end-to-end:
**Map → node selection → on-site check-in (geofence) → capture creation → image upload (resilient) → admin verification → notification → (optional) auto-publish → public viewing → user reporting → admin resolution/hide.**

Tips are also implemented (Solana devnet) behind a web feature flag.

---

## What’s implemented (by area)

### Web app (`apps/web`)
Why: deliver a map-first UX with proof-of-presence and resilient uploading on mobile networks.

What it does:
- Establishes an anonymous device session (`/v1/sessions/anonymous`) and uses `credentials: "include"` for cookie auth on API calls.
- Map-first browsing using Google Maps JS (`@react-google-maps/api`):
  - Viewport-based node fetching (`/v1/nodes?bbox=...`) and marker rendering.
  - Node selection panel, with a “Nodes in view” list.
  - Directions rendering from current location to the node.
  - Multiple map styling presets (persisted to `localStorage`).
- Proof-of-presence check-in:
  - Challenge (`/v1/nodes/{node_id}/checkins/challenge`) then verify (`/v1/nodes/{node_id}/checkins`).
  - UI handles accuracy failures, outside-geofence failures, and rate limiting (with retry timing when provided).
- Capture flow (`/capture/:captureId?`) with resilience:
  - Client-side image preprocessing/compression (JPG/PNG/WebP) before upload.
  - Capture record creation (`/v1/captures`) with attribution + rights attestation fields and a “publish when verified” intent.
  - Upload queue persisted to IndexedDB with retry/backoff and a “Pending uploads” panel (shown when non-empty):
    - Survives offline + reload, supports manual retry/remove, and resumes automatically when online.
  - Draft persistence for the “photo taken but not submitted yet” case (separate IndexedDB store) to avoid dead ends on reload.
- Rank + notifications UI:
  - Rank display (`/v1/me`) including “next unlock” copy.
  - Notifications list (`/v1/me/notifications`) and mark-read (`/v1/me/notifications/{id}/read`).
  - Demo-only rank simulation controls via `?demo=1` (UI-only; does not change server rank).
- Node detail (`/nodes/:nodeId`):
  - Shows locked-vs-visible node state (based on server response).
  - Lists verified captures with attribution/source display (`/v1/nodes/{node_id}/captures`).
  - Allows logged-in users to report a capture (`/v1/captures/{capture_id}/reports`).
  - Optional tip UI (Solana Wallet Adapter) when `VITE_TIPS_ENABLED=true`.

### API (`apps/api`)
Why: enforce geo + trust constraints server-side (not client-side), keep contracts stable, and provide minimal admin moderation controls for the demo.

What it does:
- Anonymous device sessions via HttpOnly cookie (`ga_session` by default):
  - `POST /v1/sessions/anonymous` creates/looks up a `device_id → user_id` mapping, mints a session token, stores only its hash, and sets the cookie.
- Node discovery + rank gating:
  - `GET /v1/nodes` supports optional `bbox=minLng,minLat,maxLng,maxLat`; returns only nodes where `min_rank <= user_rank`.
  - `GET /v1/nodes/{node_id}` returns either a visible `NodePublic` or a `NodeLocked` payload (no 403 “mystery lock”).
  - `GET /v1/nodes/{node_id}/captures` returns verified captures for visible nodes; for non-admin callers it filters to captures that are truly publicly visible (verified + public + required rights/attribution fields present).
- Proof-of-presence (check-in) with replay protection and abuse logging:
  - Challenge issuance (`POST /v1/nodes/{node_id}/checkins/challenge`) with per-user/node rate limiting.
  - Geofence verify (`POST /v1/nodes/{node_id}/checkins`) using PostGIS geography distance (`ST_DWithin`):
    - Enforces accuracy (`MAX_LOCATION_ACCURACY_M`), expires challenges, marks challenge as used, and issues a short-lived one-time check-in token.
    - Records abuse events for invalid challenge and outside-geofence attempts.
- Captures, state machine, and audit:
  - `POST /v1/captures` creates a `draft` capture only when provided a valid, unexpired, unused check-in token that matches the user and node (server-side enforcement).
  - `POST /v1/captures/{capture_id}/image` uploads the capture image (multipart) to development local storage and promotes `draft → pending_verification` with an audited state transition.
  - Capture state machine is explicit (`draft → pending_verification → verified/rejected/hidden`, and hides from multiple states) with reason codes and a `capture_events` audit log.
  - `PATCH /v1/captures/{capture_id}` allows updating attribution/rights fields (owner-only).
  - `POST /v1/captures/{capture_id}/publish` allows owner to make a verified capture public, but only if required attribution + rights fields exist.
- Verification, rank, and notifications:
  - Admin-only moderation endpoints (`X-Admin-Token`) under `/v1/admin`:
    - `GET /v1/admin/captures/pending`
    - `POST /v1/admin/captures/{capture_id}/transition` to `verified`/`rejected`/`hidden`
  - On `pending_verification → verified`, the API:
    - Records a user notification (“verified”, and “verified & published” when auto-published).
    - Appends a deterministic, idempotent rank event (`rank_events`) and refreshes materialized rank caches.
    - Auto-publishes if `publish_requested=true` and the capture has required rights/attribution fields.
- Reporting + takedown:
  - `POST /v1/captures/{capture_id}/reports` creates a report (rate limited per user per window).
  - Admin report review + resolution:
    - `GET /v1/admin/reports`
    - `POST /v1/admin/reports/{report_id}/resolve` can optionally hide/takedown the capture as part of resolution.
- Tips (Solana devnet receipts):
  - Data model: `artists` + `nodes.default_artist_id`, `tip_intents`, `tip_receipts`.
  - `POST /v1/tips/intents` creates a server-issued intent (amount + recipient derived from node default artist) and returns memo text that contains the `tip_intent_id`.
  - `POST /v1/tips/confirm` verifies a submitted Solana tx signature against:
    - presence of the intent id in a Memo instruction, and
    - a system transfer matching recipient + lamports amount,
    - then stores a receipt with confirmation status.
  - `GET /v1/nodes/{node_id}/tips` reports DB-backed totals and recent receipts (no chain scanning).
  - A reconciler updates receipt finality over time (see “Infra” and “Scripts”).
- Observability:
  - `X-Request-ID` support: incoming header accepted (if valid) or generated; returned on every HTTP response.
  - Structured access logs (JSON by default) include request id and duration.
  - `GET /metrics` exposes Prometheus metrics for operations, transitions, and upload bytes.
  - Optional OpenTelemetry tracing via env (`GA_OTEL_ENABLED` or `OTEL_EXPORTER_OTLP_ENDPOINT`).

### Database (Postgres + PostGIS)
Why: make the server authoritative for geo enforcement and keep a consistent audit/history trail.

What it does (core tables):
- Identity/session: `users`, `devices` (device_id mapping), `sessions` (hash-only tokens).
- Geo content: `nodes` (PostGIS `POINT` + `radius_m` + `min_rank`), `artists` and `nodes.default_artist_id` for tip recipients.
- Proof-of-presence: `checkin_challenges`, `checkin_tokens` (hash-only, one-time).
- Captures + moderation: `captures` (state, visibility, attribution/rights fields, publish_requested), `capture_events` (audit log), `content_reports`.
- Trust/anti-abuse: `abuse_events` (rate limits, invalid challenge, outside geofence, etc.).
- Rank system:
  - `rank_events` is the append-only event log with deterministic ids (idempotency).
  - `curator_rank_daily` + `curator_rank_cache` materialize points and caps (per-node-per-day uniqueness + per-day cap).
- Tips:
  - `tip_intents` records the server-issued plan (amount/recipient/expiry).
  - `tip_receipts` stores verified tx receipts and later reconciliation status upgrades.

### Domain schemas (`packages/domain/schemas`)
Why: keep a canonical “shared vocabulary” for later codegen across client/server.

What it does:
- Stores JSON schemas for key response/request shapes and enums (nodes, captures, reports, tips, rank, notifications, error codes).
- These are not currently code-generated into the API or web; they are an alignment tool.

### Infra (`infra/docker-compose.yml` and root `docker-compose.yml`)
Why: provide a reproducible local dev/demo environment (DB + API + web + optional reconciler).

What it does:
- Runs PostGIS, the FastAPI app, and the Vite dev server.
- Runs a migration step and (in `infra/docker-compose.yml`) seeds nodes + artists on first boot.
- Runs an optional `tip-reconciler` service to periodically reconcile tip receipt finality.

---

## “Why it’s built this way” (key decisions encoded in code)
- **Server-authoritative trust**: geofence checks, token validation, visibility rules, and tip receipt verification are enforced server-side.
- **Low-friction onboarding**: anonymous sessions use a device id + cookie; no login flow is required for the core demo.
- **Explicit gating and clear UX**: rank-locked nodes return structured `locked` payloads (not mysterious 403s).
- **Resilient uploads**: upload intents persist locally and retry with backoff; uploads survive offline and reload.
- **Auditability**: capture state transitions and publish events are stored in an event table; moderation actions have reason codes.
- **Rights posture by default**: public visibility requires verified state + explicit attribution + rights attestation fields.
- **Tips without chain indexing**: intent + memo linkage plus targeted tx verification avoids scanning the chain.

---

## Quick reference: endpoints currently wired

### Public / user (cookie-auth where noted)
- `GET /health`
- `POST /v1/sessions/anonymous` (sets session cookie)
- `GET /v1/me` (auth required)
- `GET /v1/me/notifications` (auth required)
- `POST /v1/me/notifications/{notification_id}/read` (auth required)
- `GET /v1/nodes?bbox=...`
- `GET /v1/nodes/{node_id}`
- `GET /v1/nodes/{node_id}/captures` (defaults to verified; non-admin sees only truly public captures)
- `POST /v1/nodes/{node_id}/checkins/challenge` (auth required)
- `POST /v1/nodes/{node_id}/checkins` (auth required)
- `POST /v1/captures` (auth required)
- `GET /v1/captures/{capture_id}` (auth required; owner-only)
- `PATCH /v1/captures/{capture_id}` (auth required; owner-only)
- `POST /v1/captures/{capture_id}/image` (auth required; owner-only)
- `POST /v1/captures/{capture_id}/publish` (auth required; owner-only)
- `POST /v1/captures/{capture_id}/reports` (auth required)
- `POST /v1/tips/intents` (auth required)
- `POST /v1/tips/confirm` (auth required)
- `GET /v1/nodes/{node_id}/tips`

### Admin (requires `X-Admin-Token`)
- `GET /v1/admin/captures/pending`
- `POST /v1/admin/captures/{capture_id}/transition`
- `GET /v1/admin/reports`
- `POST /v1/admin/reports/{report_id}/resolve`
- `GET /v1/admin/abuse-events`

### Ops
- `GET /metrics` (Prometheus)
- `/media/*` (development local media serving)

---

## Scripts & operators’ tools (what exists)
- `apps/api/scripts/seed_nodes.py`: upsert nodes from `data/seed/nodes.json` into PostGIS.
- `apps/api/scripts/seed_artists.py`: upsert artists from `data/seed/artists.json` and attach `nodes.default_artist_id`.
- `apps/api/scripts/generate_seed_nodes_from_places.py`: refresh node seed data from Google Places (demo-only; ToS-sensitive).
- `apps/api/scripts/admin_list_pending_captures.py`: CLI helper to list pending captures via admin API.
- `apps/api/scripts/admin_list_abuse_events.py`: CLI helper to list abuse events via admin API.
- `apps/api/scripts/reconcile_tip_receipts.py`: reconcile receipt finalization statuses (one-shot or `--loop`).
- `apps/api/scripts/backfill_rank_events.py`: backfill deterministic rank events for existing verified captures.

---

## How to run (local)
- Recommended: `infra/docker-compose.yml` for a full local stack with seeding.
- Alternative: root `docker-compose.yml` for a stack with configurable ports (useful when ports collide).

Also see `docs/COMMANDS.md` for the current runbook-style commands.

---

## Tests & checks (what exists)
- API: `apps/api/tests/` contains coverage for sessions, nodes, check-in, captures (state transitions, uploads, publish), moderation/reports, notifications, rank events/materialization rules, tips (intents/confirm), and observability.
- Web: `apps/web/src/**.test.ts(x)` contains coverage for the capture flow, image preprocessing, upload API retry behavior, map route behavior, and tip flow state.

---

## Demo readiness checklist (stop-ship)
- Web loads and the Google map renders (valid `VITE_GOOGLE_MAPS_API_KEY`).
- Anonymous session works end-to-end (cookie set; API calls succeed with `credentials: "include"`).
- Nodes load for the current viewport and can be opened in `/nodes/:nodeId`.
- Check-in challenge + verify works when inside the radius; outside-geofence and low-accuracy errors are clear.
- Capture create + image upload works; pending uploads persist across offline + reload and can be retried.
- Admin can verify a pending capture; user sees a notification.
- If publish was requested and rights/attribution are present, verified captures become public and show in node detail.
- Reporting and admin resolution work; resolved/hid captures stop showing publicly.

---

## Potentially urgent outstanding items
- Web feature flag drift: tips are gated by `VITE_TIPS_ENABLED`, but `.env.example` does not document it; demo setups may miss that toggle.
- The verification event emitter (`apps/api/src/groundedart_api/domain/verification_events.py`) is currently a no-op; if you intend to integrate external workflows (webhooks/queues), that boundary still needs a real implementation.
- Media serving is dev-oriented (`/media/*` is static and unauthenticated); do not treat it as production-ready access control.
- Cookie security is configured for local dev (`secure=False`); any deployment needs a deliberate `secure`/domain/SameSite review with CORS origins.
