## Milestone 3 — Verification state machine (MVP)

This section turns Milestone 3 from `docs/ROADMAP.md` into an implementable backlog: server-enforced capture states, an auditable moderation path, and basic anti-abuse.

### M3-01 — Capture verification reason codes (contract + storage)

**Context (what is achieved)**: capture transitions carry stable, explainable reason codes (not free-form strings), and the API can safely expose “why” to admins without leaking it publicly.

**Why**: reason codes are how the system stays debuggable and how future rank/scoring can rely on verification outcomes without parsing arbitrary text.

**Change plan (specific files)**:
- Domain contracts:
  - Add `packages/domain/schemas/capture_state_reason_code.json` (string enum) and reference it from any moderation/audit schemas introduced in later tasks.
- API storage + validation:
  - Treat `Capture.state_reason` as a *reason code* (validated against the enum) for M3 (defer any column rename).
  - Enforce reason requirements by state:
    - `pending_verification` must have a non-null reason (e.g. `image_uploaded`).
    - `rejected`/`hidden` must have a non-null reason (moderation outcome).
    - `verified` may have a reason (optional) but should remain explainable (e.g. `manual_review_pass`).
  - Wire validation into a single transition helper (see M3-03), not scattered across routers.

**Acceptance criteria**:
- Any attempt to set a state without the required reason code is rejected with a stable `error.code`.
- Reason codes used by the API are declared in `packages/domain/schemas/capture_state_reason_code.json`.

---

### M3-02 — Capture state audit log (append-only)

**Context (what is achieved)**: every capture state transition is recorded as an append-only audit event with `from_state`, `to_state`, actor, reason code, and timestamp.

**Why**: moderation must be auditable; without an event log, “who changed what and why” becomes impossible to answer and undermines trust.

**Change plan (specific files)**:
- Add a new DB table/model (example name: `CaptureStateEvent`) in `apps/api/src/groundedart_api/db/models.py` with:
  - `capture_id`, `from_state`, `to_state`, `reason_code` (stored in `state_reason` or separately), `actor_type`, `actor_user_id` (nullable), `created_at`, `details` (optional JSON).
- Add an Alembic migration under `apps/api/src/groundedart_api/db/migrations/versions/` for the table + indexes (at least `capture_id, created_at`).
- Ensure any code path that changes `Capture.state` writes exactly one audit event in the same DB transaction (upload promotion and admin moderation).

**Acceptance criteria**:
- Upload promotion (`draft` → `pending_verification`) writes an audit event.
- Admin moderation transitions write an audit event with actor and reason code.
- Tests assert that transitions create audit rows (add coverage under `apps/api/tests/`).

---

### M3-03 — Server-enforced moderation transitions (admin endpoint + helper)

**Context (what is achieved)**: an admin can move captures through `pending_verification → verified/rejected/hidden` via a minimal API, and all transitions are validated and auditable.

**Why**: M3 requires the server (not the UI) to be the authority for verification; “manual review” needs a safe, testable entry point.

**Change plan (specific files)**:
- Admin auth (MVP):
  - Add an admin auth dependency (e.g. `require_admin`) using a shared secret in `apps/api/src/groundedart_api/settings.py` (e.g. `admin_api_token`) and a header like `X-Admin-Token`.
  - Keep admin routes under a distinct router module (e.g. `apps/api/src/groundedart_api/api/routers/admin.py`) and include it from `apps/api/src/groundedart_api/main.py`.
- Transition helper:
  - Implement a single transition function (new module under `apps/api/src/groundedart_api/domain/`) that:
    - loads the capture,
    - calls `assert_valid_capture_transition(...)`,
    - enforces reason-code requirements (M3-01),
    - writes the audit event (M3-02),
    - updates `Capture.state` + `Capture.state_reason`,
    - commits atomically.
- Admin API surface (minimal):
  - List pending captures (optional filters by node/time) for review.
  - Transition endpoint that accepts `{ target_state, reason_code, details? }`.
  - Add/extend domain JSON schemas in `packages/domain/schemas/` for these request/response shapes.

**Acceptance criteria**:
- Only admin-authenticated requests can transition captures to `verified/rejected/hidden`.
- Invalid transitions are rejected with stable error codes.
- A newly `verified` capture becomes visible in the normal node captures read path (see M3-04) and can be rendered by the web UI (see M3-08).

---

### M3-04 — Public capture visibility rules (verified-only by default)

**Context (what is achieved)**: public read endpoints cannot be used to enumerate non-public capture states (`draft`, `pending_verification`, `rejected`, `hidden`).

**Why**: non-verified and moderation outcomes are sensitive; leaking them enables harassment and gaming, and violates the “trusted content” posture.

**Change plan (specific files)**:
- Lock down `GET /v1/nodes/{node_id}/captures` in `apps/api/src/groundedart_api/api/routers/nodes.py`:
  - Default and non-admin behavior returns only `CaptureState.verified`.
  - If keeping the `state` query parameter, reject non-`verified` values unless admin-authenticated (or remove the parameter and add an admin-only endpoint instead).
- Add tests in `apps/api/tests/test_nodes.py` (or a new module) asserting:
  - anonymous/authenticated non-admin requests cannot request `hidden`/`rejected`/`pending_verification`,
  - the endpoint returns only `verified` captures.

**Acceptance criteria**:
- Non-admin clients can only retrieve `verified` captures from node endpoints.
- “Verified captures” can be powered by this endpoint without exposing moderation data.

---

### M3-05 — Async verification/scoring hook boundary (no-op allowed)

**Context (what is achieved)**: capture transitions emit a structured “verification event” that can later be handled by a worker (similarity, scoring), while remaining a no-op for now.

**Why**: M3 explicitly calls for an async boundary; having the hook in place prevents tight coupling later and makes state changes observable.

**Change plan (specific files)**:
- Add a small interface + dependency in `apps/api/src/groundedart_api/` (new module under `domain/` or `api/`) for emitting events like:
  - `capture_uploaded(capture_id, node_id, user_id)`
  - `capture_state_changed(capture_id, from_state, to_state, reason_code)`
- Call the hook from:
  - `apps/api/src/groundedart_api/api/routers/captures.py` (on upload promotion),
  - the moderation transition helper from M3-03.
- Add tests that override/inject the hook and assert it is called (no background queue required yet).

**Acceptance criteria**:
- Upload promotion and admin moderation transitions trigger the hook.
- Hook behavior is isolated behind a dependency boundary (can be swapped for a real worker later).

---

### M3-06 — Basic anti-abuse: per-node caps + rate limits (server-side)

**Context (what is achieved)**: the API limits spammy behavior (challenge creation, capture creation, uploads) with clear errors and server-enforced caps.

**Why**: verification has no meaning if attackers can flood nodes with pending submissions; M3 calls for basic anti-abuse and tracking.

**Change plan (specific files)**:
- Add settings in `apps/api/src/groundedart_api/settings.py` (MVP defaults) such as:
  - max check-in challenges per user per node per window,
  - max captures per user per node per day,
  - max pending_verification captures per node (global cap).
- Enforce caps in:
  - `apps/api/src/groundedart_api/api/routers/nodes.py` (`/checkins/challenge`, `/checkins`),
  - `apps/api/src/groundedart_api/api/routers/captures.py` (`POST /captures`, `/captures/{id}/image`).
- Add/extend error-code enums in `packages/domain/schemas/checkin_error_code.json` and/or `packages/domain/schemas/capture_error_code.json` for rate limit/cap failures, and mirror them in web types (e.g. `apps/web/src/features/checkin/api.ts`, `apps/web/src/features/captures/api.ts`).
- Add tests that exceed caps deterministically using the injected clock (`groundedart_api/time.py`).

**Acceptance criteria**:
- Caps are enforced by the API (not only UI), with stable `error.code` values and appropriate HTTP status codes.
- Tests cover at least one cap for check-ins and one cap for captures.

---

### M3-07 — Suspicious behavior tracking (first-class records)

**Context (what is achieved)**: suspicious/abusive events are recorded in a queryable way (not only logs) to support future automated scoring and moderation queues.

**Why**: “tracking” is part of M3; without persistent records, admins can’t review patterns and the system can’t evolve toward automated trust signals.

**Change plan (specific files)**:
- Add a small DB table/model (example name: `AbuseEvent`) in `apps/api/src/groundedart_api/db/models.py` and a migration under `apps/api/src/groundedart_api/db/migrations/versions/`.
- Record events from anti-abuse enforcement (M3-06) and from notable check-in failures in `apps/api/src/groundedart_api/api/routers/nodes.py` (e.g. repeated invalid challenge, repeated outside-geofence).
- Add an admin-only endpoint to view recent abuse events (can live in the admin router from M3-03).

**Acceptance criteria**:
- Triggering an anti-abuse cap writes an abuse event.
- Admin can retrieve recent events to debug abuse patterns.

---

### M3-08 — Web: Node detail shows real verified captures

**Context (what is achieved)**: the “Verified captures” section in node detail is powered by real API state (`verified`) rather than a static empty state.

**Why**: Milestone 3 exit criteria requires the node detail surface to be backed by verification state.

**Change plan (specific files)**:
- Add a client API call for node captures:
  - Either in `apps/web/src/features/nodes/api.ts` or `apps/web/src/features/captures/api.ts`, add `listNodeCaptures(nodeId)` returning `CapturesResponse`.
- Update `apps/web/src/routes/NodeDetailRoute.tsx` to:
  - fetch verified captures for `nodeId`,
  - render thumbnails using `capture.image_url` (and keep a clear empty state when none),
  - handle loading/error states.

**Acceptance criteria**:
- After a capture is moderated to `verified`, it appears in node detail without code changes.
- Node detail remains usable when there are zero captures (empty state) or when the API call fails (error state).

---

## Testing — Coverage + harness

This section turns `docs/TESTS.md` into an implementable backlog. It is intentionally cross-cutting (API, domain, and web).

### T-01 — API testability: injectable time + test media storage

**Context (what is achieved)**: API tests can deterministically exercise time-based logic (session TTLs, token expiry) and upload behavior without writing to production media paths.

**Why**: stable integration tests require controlling “now” and isolating file IO; otherwise tests become flaky and/or leak artifacts into the repo.

**Change plan (specific files)**:
- Time:
    - Decision: Introduce a `utcnow()` provider that can be injected/overridden in tests (FastAPI dependency or module-level indirection), and migrate routers off direct calls to `groundedart_api.db.models.utcnow`.
- Storage:
  - Route storage through a dependency so tests can point to a temp directory (or stub storage) without touching `./.local_media`.
  - Add an autouse pytest fixture that sets `MEDIA_DIR` (or overrides `get_settings()`) to a per-test temporary path and cleans it up.

**Acceptance criteria**:
- Tests can set “now” and reliably assert `expires_at` semantics for sessions/challenges/tokens.
- Upload tests do not write into the repo; all media writes go into a temp path and are cleaned up.

---

### T-02 — API tests: sessions (device reuse + cookie issuance + expiry)

**Context (what is achieved)**: comprehensive integration tests for `/v1/sessions/anonymous` covering device reuse, cookie behavior, and TTL/expiry edge cases.

**Why**: sessions underpin authentication; regressions here cascade into “everything looks broken” symptoms across the API and web.

**Change plan (specific files)**:
- Add `apps/api/tests/test_sessions.py` covering:
  - new device creates a new user + device + profile,
  - same device ID reuses the same user and updates `devices.last_seen_at`,
  - response sets the expected cookie (`Settings.session_cookie_name`) with expected attributes,
  - `session_expires_at` aligns with `Settings.session_ttl_seconds` (use the time-control approach from T-01),
  - invalid payload (e.g. non-UUID device_id) returns 422.

**Acceptance criteria**:
- Tests verify cookie issuance and stable semantics for device reuse and expiration.

---

### T-03 — API tests: auth gates (`CurrentUser` vs `OptionalUser`)

**Context (what is achieved)**: tests lock down how auth behaves for endpoints that accept anonymous users (`OptionalUser`) vs require auth (`CurrentUser`).

**Why**: subtle auth regressions (cookie name changes, expiry checks, revoked session handling) are easy to introduce and hard to spot manually.

**Change plan (specific files)**:
- Add `apps/api/tests/test_auth_gates.py` covering:
  - `/v1/me` returns 401 with `error.code == "auth_required"` when missing/invalid/expired cookie,
  - `/v1/me` returns 200 with the right `user_id` when cookie is present,
  - `/v1/nodes` works without a cookie (anonymous rank defaults to 0),
  - revoked/expired sessions behave as anonymous for `OptionalUser` routes.

**Acceptance criteria**:
- Auth-required and auth-optional behaviors are explicitly tested and stable.

---

### T-04 — API tests: nodes (invalid bbox, not found, rank filtering)

**Context (what is achieved)**: nodes list/detail behavior is covered for parsing errors, 404 paths, and curator-rank visibility rules (`min_rank`).

**Why**: these endpoints are the main map surface; correctness matters for both UX and security (hiding higher-rank nodes).

**Change plan (specific files)**:
- Extend `apps/api/tests/test_api_smoke.py` or add `apps/api/tests/test_nodes.py` to cover:
  - invalid `bbox` returns 400 with `error.code == "invalid_bbox"` and includes the bad `bbox` in details,
  - `GET /v1/nodes/{node_id}` returns 404 `node_not_found` for missing nodes,
  - `min_rank` filtering works for both list and detail:
    - anonymous user sees only nodes where `min_rank <= 0`,
    - an authenticated user with higher rank sees additional nodes.

**Acceptance criteria**:
- Rank filtering is tested for list and detail; invalid bbox and not-found paths are tested.

---

### T-05 — API tests: check-ins (TTL, single-use, accuracy, geofence details)

**Context (what is achieved)**: check-in flow is fully covered for challenge creation TTL, single-use semantics, accuracy threshold, and geofence detail fields.

**Why**: check-ins are core to the product’s “grounded” behavior and are sensitive to time and geospatial edge cases.

**Change plan (specific files)**:
- Extend `apps/api/tests/test_checkin.py` to add/confirm:
  - challenge creation sets `expires_at` relative to `Settings.checkin_challenge_ttl_seconds` (use T-01 time control),
  - successful check-in marks the challenge as used (and a reused challenge fails),
  - outside-geofence error always includes `radius_m` and includes a reasonable `distance_m` (avoid boundary flakiness).

**Acceptance criteria**:
- All check-in invariants listed in `docs/TESTS.md` are covered and deterministic.

---

### T-06 — API tests: captures (token semantics, state creation, transitions)

**Context (what is achieved)**: capture creation is tested end-to-end: token consumption, capture state initialization, and any state transition helpers are covered.

**Why**: captures are the bridge between check-in and uploads; regressions here can silently break user flows.

**Change plan (specific files)**:
- Extend `apps/api/tests/test_capture_tokens.py` to verify:
  - creating a capture sets `CheckinToken.used_at` (token consumption),
  - created capture has expected initial state (`draft`, pending upload) and key fields.
- Keep `apps/api/tests/test_capture_state.py` as the unit-test home for state transition rules; add tests there if new transition helpers are introduced.

**Acceptance criteria**:
- Capture token single-use + expiry + consumption are test-covered, and capture initial state is asserted.

---

### T-07 — API tests: uploads (`/v1/captures/{id}/image`)

**Context (what is achieved)**: upload endpoint behavior is covered for happy path, forbidden/not-found paths, and persistence of `image_path`/`image_mime`.

**Why**: uploads are the highest-risk part of M2 and require strong regression coverage (especially once retry/idempotency semantics evolve).

**Change plan (specific files)**:
- Add `apps/api/tests/test_capture_uploads.py` covering:
  - happy path: image upload persists `image_path`/`image_mime` and response includes `image_url`,
  - forbidden upload (wrong user) returns 403 with stable `error.code`,
  - capture not found returns 404 `capture_not_found`,
  - use a tiny fixture file and the isolated media path from T-01.

**Acceptance criteria**:
- Upload behavior is covered without writing to the repo, and returned payload fields are asserted (not brittle full-payload snapshots).

---

### T-08 — Error contracts: schema-backed `error.code` enforcement

**Context (what is achieved)**: every `error.code` returned by the API is declared in `packages/domain/schemas/*_error_code.json`, and tests enforce this.

**Why**: stable error codes are required for robust client UX; schema-backed contracts prevent accidental breaking changes.

**Change plan (specific files)**:
- Decide how error-code schemas are organized:
  - **Option A**: keep per-feature enums (e.g. checkin/capture/sessions/nodes) and add missing ones.
  - **Option B**: introduce a shared `api_error_code.json` and reference it from per-feature error response schemas.
- Add missing schema enums in `packages/domain/schemas/` for error codes currently returned but not declared (e.g. `invalid_bbox`).
- Add an API test module (e.g. `apps/api/tests/test_error_contracts.py`) that:
  - loads the relevant `*_error_code.json` enums,
  - asserts that exercised endpoints only return codes present in the schemas.

**Acceptance criteria**:
- A failing test catches any new/changed `error.code` that is not reflected in the domain schemas.

---

### T-09 — Domain schemas: add validation (when schema enforcement/codegen lands)

**Context (what is achieved)**: the JSON Schemas in `packages/domain/schemas/` are mechanically validated in CI so broken refs or invalid schema syntax can’t slip in.

**Why**: once schemas become a real contract (codegen, runtime validation, shared types), schema breakage is high-impact and should fail fast.

**Change plan (specific files)**:
- Decide where schema validation lives:
  - **Option A (Python)**: add a pytest module under `apps/api/tests/` that validates every `*.json` schema with a JSON Schema library and ensures `$ref` resolution works relative to the folder.
  - **Option B (Node)**: add a small `apps/web` (or repo-level) script using Ajv to validate all schemas (and wire it into CI).
- Ensure the validator runs in CI and is easy to run locally.

**Acceptance criteria**:
- A broken `$ref` or invalid schema file fails the build with a clear error pointing to the schema path.

---

### T-10 — Web test harness + baseline coverage

**Context (what is achieved)**: `apps/web` has a test runner and initial tests for client behavior and UX guardrails.

**Why**: without a harness, regressions in retry/error handling and auth guardrails will slip through and are costly to diagnose.

**Change plan (specific files)**:
- Choose the web testing stack:
  - **Unit/integration**: Vitest + React Testing Library for components/hooks and API wrapper behavior.
  - **E2E** (optional but recommended): Playwright for check-in → capture → upload flows and “weak network” scenarios.
- Wire scripts into `apps/web/package.json` (e.g. `test`, `test:watch`, `test:e2e`).
- Add baseline tests covering the `docs/TESTS.md` web items:
  - API client wrapper retry + error mapping,
  - check-in/capture UI states (token display, upload progress/errors),
  - location/accuracy/outside-geofence UX,
  - consistent handling of 401/403/400.

**Acceptance criteria**:
- `apps/web` has a runnable test command and at least one test per category above.
