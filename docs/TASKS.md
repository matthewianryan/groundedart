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
