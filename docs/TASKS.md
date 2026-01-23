# Tasks

This file breaks milestones into implementable tasks with explicit contracts and acceptance criteria.

Conventions:
- Tasks are ordered by **system dependency** (see `docs/ROADMAP.md`).
- Use `[ ]` / `[x]` checkboxes as work is completed.
- “Contracts” are the API/domain guarantees other code can rely on (schemas, reason codes, invariants).

---

## Milestone 1 — On-site check-in (MVP)

Roadmap goal: a user can only begin a capture flow when physically inside a node’s geofence.

Note: a baseline M1 check-in flow exists in this repo already (see `docs/M0.md`). The tasks below focus on making the MVP decision/contract explicit, hardening server invariants, and upgrading UX.

### [ ] M1-01 — Make the geofence model authoritative (point + radius)

**What this achieves**
- Establishes a single authoritative geometry model for “inside the zone” decisions so check-in, capture gating, and future verification all agree.

**Why**
- A mismatched or client-decided geofence creates easy spoofing and inconsistent UX; the API must be the source of truth.

**Change plan (files)**
- `docs/M0.md`: confirm the chosen model (point + radius) as the M1 decision and note “polygon later”.
- `docs/DATA_MODEL.md`: clarify that `Node` geometry is concretely `(center point, radius_m)` for MVP.
- `apps/api/src/groundedart_api/db/models.py`: ensure `Node.radius_m` constraints are explicit (non-negative; optionally minimum > 0).
- `apps/api/src/groundedart_api/db/migrations/versions/*`: add a DB-level constraint migration if missing (e.g., `CHECK (radius_m >= 0)`).
- `packages/domain/schemas/node_public.json`: ensure `radius_m` constraints match DB/API expectations.

**Contracts**
- `Node` geofence for MVP is `POINT(srid=4326) + radius_m (meters)`.
- “Inside” is defined server-side via PostGIS (e.g., `ST_DWithin(Geography(point), Geography(center), radius_m)`).
- Any future polygon support is additive and must not silently change semantics of existing nodes.

**Acceptance criteria**
- Seeded and newly-created nodes have a well-defined `radius_m` that the API uses for check-in decisions.
- The API never relies on client-side “inside zone” checks for authorization.

**Require `radius_m >= 25m**

**Non-goals**
- Supporting polygon geofences in M1.

---

### [ ] M1-02 — Define domain contracts for check-in (schemas + reason codes)

**What this achieves**
- Makes the check-in flow interoperable across API and web by defining stable request/response shapes and failure codes in `packages/domain`.

**Why**
- M1 exit criteria requires stable reason codes; without a shared source of truth, clients drift and UX becomes inconsistent.

**Change plan (files)**
- `packages/domain/schemas/`:
  - Add `checkin_challenge_response.json` (challenge id + expiry).
  - Add `checkin_request.json` (challenge id + lat/lng + accuracy).
  - Add `checkin_response.json` (token + expiry).
  - Add `checkin_error_code.json` (string enum of check-in failure codes).
- `apps/api/src/groundedart_api/api/schemas.py`: ensure Pydantic models match the domain schemas (field names + types).
- `apps/web/src/features/checkin/api.ts`: ensure TS types match the domain schemas (no hand-wavy `any`/shape drift).
- `docs/IMPLEMENTATION_PRACTICES.md`: link to the new schemas as the canonical contract for M1 check-in.

**Contracts**
- Endpoints:
  - `POST /v1/nodes/{node_id}/checkins/challenge` → `{ challenge_id, expires_at }`
  - `POST /v1/nodes/{node_id}/checkins` with `{ challenge_id, lat, lng, accuracy_m }` → `{ checkin_token, expires_at }`
- Error envelope shape is always `packages/domain/schemas/error.json`.
- Check-in failures use stable `error.code` values (see `checkin_error_code.json`), including at minimum:
  - `node_not_found`
  - `invalid_challenge`
  - `challenge_used`
  - `challenge_expired`
  - `location_accuracy_too_low`
  - `outside_geofence`

**Acceptance criteria**
- All check-in-related errors emitted by the API use one of the documented `checkin_error_code.json` values.
- The web client can map `error.code` to a specific UX state without string parsing.

**Non-goals**
- Codegen for schemas (manual alignment is fine for M1).

---

### [ ] M1-03 — Harden the server-side check-in flow (details, replay, and invariants)

**What this achieves**
- Produces an auditable, abuse-resistant proof-of-presence token that downstream endpoints can rely on.

**Why**
- The check-in token becomes the gate for capture creation; if it’s replayable or under-specified, M2+ trust collapses.

**Change plan (files)**
- `apps/api/src/groundedart_api/api/routers/nodes.py`:
  - Ensure all failure cases return stable codes (per M1-02) and include useful `details` for UX.
  - Add `details` for `outside_geofence` (at minimum `radius_m`, and optionally `distance_m` if computed server-side).
  - Add `details` for `invalid_challenge` (avoid leaking whether a challenge exists; keep messaging consistent).
- `apps/api/src/groundedart_api/db/models.py`:
  - Consider adding indexes to support lookup/cleanup (e.g., `(user_id, node_id, expires_at)` for challenges/tokens).
- `apps/api/src/groundedart_api/settings.py`:
  - Ensure `checkin_challenge_ttl_seconds`, `checkin_token_ttl_seconds`, and `max_location_accuracy_m` are documented and configurable.
- `apps/api/tests/test_api_smoke.py` (or a new `apps/api/tests/test_checkin.py`):
  - Add API-level tests for: invalid/expired/used challenge; accuracy too low; outside geofence; successful token issuance.

**Contracts**
- Challenge:
  - One-time use; expires server-side; bound to `(user_id, node_id)`.
- Token:
  - Opaque random value; only a hash is stored server-side.
  - One-time use; expires server-side; bound to `(user_id, node_id)`.
- Replay protection:
  - Reusing a `challenge_id` must fail with `challenge_used`.
  - Reusing a `checkin_token` for capture creation must fail with `invalid_checkin_token`.

**Acceptance criteria**
- Check-in failures are explainable via `error.code` and actionable `error.details` (enough for the client to tell the user what to do next).
- A token cannot be used:
  - by a different user
  - for a different node
  - after expiry
  - more than once

**Non-goals**
- Advanced GPS spoof detection (device integrity, mock location detection).
- Full rate limiting/abuse scoring (can be a Milestone 3/4 enhancement unless it becomes necessary).

---

### [ ] M1-04 — Web UX for “not inside the zone” (accuracy + connectivity aware)

**What this achieves**
- A check-in experience that communicates “why not” clearly and guides users to success without confusing dead-ends.

**Why**
- Real GPS is noisy; users need feedback about accuracy and next steps (move closer, wait for better accuracy, retry) and must survive intermittent connectivity.

**Change plan (files)**
- `apps/web/src/routes/MapRoute.tsx`:
  - Represent check-in state explicitly (idle → requesting_location → challenging → verifying → success/failure).
  - Handle API errors by `error.code` (not string matching on `message`).
  - Display accuracy (`accuracy_m`) and, when provided by API, `distance_m`/`radius_m`.
  - Provide “Retry check-in” and “Get directions” CTAs that preserve the selected node.
- `apps/web/src/api/http.ts`:
  - Ensure API errors surface `error.code` + `details` in a structured way to features.
- `apps/web/src/features/checkin/api.ts`:
  - Add typed error handling expectations (challenge/create/verify).

**Contracts**
- The web app treats the API as the authority; it does not unlock capture UI based on local distance math.
- UX maps stable `error.code` values (from M1-02) to stable UI states.

Decision: **Online-only check-in** (simplest): show “Offline” state; user retries when online.

**Acceptance criteria**
- When check-in fails, the UI displays a clear reason and a next step (retry, move closer, improve accuracy, reconnect).
- The “Create capture” action is disabled unless a valid check-in token is present.
- The UI behaves predictably when location permission is denied, GPS times out, or the network is offline.

**Non-goals**
- Perfect indoor positioning.
- Background location tracking.

---

### [ ] M1-05 — Enforce check-in token gating for capture creation (API + docs)

**What this achieves**
- Ensures all downstream capture creation is grounded in a recent, single-use proof-of-presence token.

**Why**
- M1 exit criteria: a valid token is required for downstream capture creation; without this, M2 uploads are trivially replayable.

**Change plan (files)**
- `apps/api/src/groundedart_api/api/routers/captures.py`: ensure create-capture rejects missing/expired/reused tokens with stable codes.
- `packages/domain/schemas/`: add `create_capture_request.json` and `create_capture_response.json` (or expand an existing capture schema set).
- `apps/web/src/features/captures/api.ts`: align request fields with the domain schema(s).
- `apps/api/tests/`: add or extend tests for token gating (invalid token, expired token, reused token, wrong node).

**Contracts**
- `POST /v1/captures` requires `checkin_token` and rejects:
  - token not found (`invalid_checkin_token`)
  - token expired (`checkin_token_expired`)
  - token already used (`invalid_checkin_token`)
  - token bound to different node/user (`invalid_checkin_token`)

**Acceptance criteria**
- Capture creation cannot succeed without a valid, unused, unexpired token bound to the current user and node.
- Error codes and shapes follow the shared domain contract (`packages/domain/schemas/error.json`).

**Non-goals**
- Upload reliability/compression (Milestone 2).
