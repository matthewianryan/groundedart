# Tasks

This file tracks build tasks with enough detail to implement without guessing. It currently focuses on **Milestone 2** from `docs/ROADMAP.md` plus a cross-cutting testing backlog derived from `docs/TESTS.md`.

## Milestone 2 — Capture + upload (MVP)

Milestone goal (per `docs/ROADMAP.md`): a user can capture and upload a photo reliably on weak mobile networks.

### M2-01 — Resolve capture/upload architecture + contracts

**Context (what is achieved)**: document and lock the canonical M2 “capture + upload” flow to match the repository implementation and unblock reliable client behavior work.

**Why**: without a single canonical contract, we risk implementing reliability work (retry/persistence/idempotency) against mismatched backend assumptions.

**Change plan (specific files)**:
- Confirm the canonical flow in `docs/ARCHITECTURE.md` (“Capture + upload”) and `docs/ROADMAP.md` M2:
  - Ordering: `POST /v1/captures` → `POST /v1/captures/{id}/image`
  - Storage: API-terminated (MVP)
  - Resilience: retry-only (M2)
- Document the “happy path” and failure modes (retry, resume, offline intent) in `docs/COMMANDS.md` (how to manually test on mobile + network throttling).
- Define (or confirm) the M2 contract(s) in `packages/domain/schemas/` and keep them aligned with:
  - `apps/api/src/groundedart_api/api/schemas.py`
  - `apps/web/src/features/captures/api.ts`
- Record deferred alternatives (asset-first ordering, direct-to-storage, true resumable) in `docs/FUTUREOPTIONS.md`.

**Contracts (canonical for M2)**:
- Ordering: `POST /v1/captures` (token consumed) → `POST /v1/captures/{id}/image` (retryable).
- **Storage backend for MVP**: API-terminated upload to server storage.
- **Resumability scope**: “retry only”.

**Acceptance criteria**:
- A single “source of truth” flow exists in docs, and the codebase is expected to match it.
- `packages/domain/schemas/` cover the chosen capture + upload API responses and error envelopes used by the web client.
- Deferred options are written down in `docs/FUTUREOPTIONS.md` so they can be revisited intentionally.

**Non-goals**:
- Implementing asset-first ordering, direct-to-storage, or true resumable uploads in M2.

---

### M2-02 — Web capture UX (camera-first) with explicit states

**Context (what is achieved)**: replace the current “file input + Create capture” scaffold on `apps/web/src/routes/MapRoute.tsx` with a camera-first capture flow that has a clear state machine (capture → preview → submit → uploading → success/failure).

**Why**: M2 requires a reliable, mobile-friendly capture experience. A structured UX is required to support retries, background upload, and not losing the user’s intent.

**Change plan (specific files)**:
- Introduce a dedicated capture UI surface:
  - either a new route (e.g. `apps/web/src/routes/CaptureRoute.tsx`) wired in `apps/web/src/App.tsx`,
  - or a modal/flow component owned by `apps/web/src/features/captures/`.
- Refactor `apps/web/src/routes/MapRoute.tsx` to navigate into the capture flow (instead of embedding the raw file input).
- Extend `apps/web/src/features/captures/` with UI + state primitives (e.g. `CaptureFlow.tsx`, `captureFlowState.ts`).

**Contracts (client-side)**:
- The capture flow produces an image `Blob` + a small metadata object to hand to the upload layer (capture intent).

**Acceptance criteria**:
- On mobile, “Take photo” reliably opens a camera-capable picker and supports retake before upload.
- UI exposes explicit states (at minimum: `capturing`, `preview`, `submitting`, `uploading`, `success`, `failure`) with actionable retry/cancel.
- The flow never attempts capture creation or upload unless a valid check-in token is present.

**Non-goals**:
- Full PWA background sync/service worker implementation (can be an upgrade later if needed for reliability).

---

### M2-03 — Client-side image preprocessing (resize/compress + EXIF stripping)

**Context (what is achieved)**: add a deterministic preprocessing step so uploads are smaller and more reliable on weak networks, and avoid accidentally persisting sensitive EXIF metadata.

**Why**: large original images (especially from modern phones) will fail more often on mobile networks; EXIF (including GPS) is privacy-sensitive and should not be shipped by default.

**Change plan (specific files)**:
- Add an image preprocessing module (e.g. `apps/web/src/features/captures/imagePreprocess.ts`) used by the capture flow before upload.
- Add unit-level tests for the preprocessing behavior (location depends on existing web test setup; if none exists yet, add a minimal test harness only for this module).
- Document chosen constraints and rationale in `docs/PRIVACY_SECURITY.md` (EXIF posture) if needed.

**Contracts**:
- Define preprocessing targets in code as constants (max dimensions, target format, and max bytes) so UX + API limits can agree.

**Acceptance criteria**:
- Preprocessed output is consistently below a chosen size ceiling (explicitly defined) for typical phone photos, and preserves correct orientation.
- Output does not include original EXIF metadata (verified via re-encoding behavior).
- The module reports actionable failures (unsupported input, decode failure) so UX can guide the user.

**Non-goals**:
- “Best image” quality scoring or automatic rejection heuristics (belongs to verification/ranking milestones).

---

### M2-04 — Resilient upload client (retry + persisted intent)

**Context (what is achieved)**: implement an upload mechanism that can survive flaky connectivity without forcing the user to start over, by persisting “capture intent” locally and retrying safely.

**Why**: M2 exit criteria requires upload failures to be recoverable without losing the capture intent.

**Change plan (specific files)**:
- Add an upload queue + persistence layer in `apps/web/src/features/captures/` (e.g. `uploadQueue.ts`, `indexedDb.ts`, `useUploadQueue.ts`).
- Update `apps/web/src/features/captures/api.ts` to support:
  - retries with bounded exponential backoff,
  - surfacing structured API error codes to the UI,
  - optional progress reporting (best-effort on browser APIs).
- Update the capture UX (from M2-02) to:
  - enqueue intent, show progress and retry,
  - and provide a “resume pending uploads” surface on app start or on `/map`.

**Contracts**:
- The persisted intent must include `capture_id` and the preprocessed `Blob` (canonical: create then upload).
- Asset-first ordering is deferred; see `docs/FUTUREOPTIONS.md`.

**Acceptance criteria**:
- With network throttling or intermittent offline/online toggles, uploads retry automatically and can be manually retried without recapturing.
- Reloading the page does not lose in-progress or failed uploads; the user can resume.
- Duplicate submits do not create multiple captures for a single user action (idempotency must be defined by contract; see M2-05).

**Non-goals**:
- True resumable/chunked uploads (see `docs/FUTUREOPTIONS.md`).

---

### M2-05 — API upload robustness: limits, atomic writes, and stable errors

**Context (what is achieved)**: make the server-side upload endpoint safe to retry and predictable under failure (partial uploads, oversized uploads, wrong MIME types), with stable error codes so the client can do the right thing.

**Why**: weak networks and retries can lead to corrupted files unless writes are atomic; without explicit limits and error codes, the client cannot implement reliable recovery UX.

**Change plan (specific files)**:
- Harden `apps/api/src/groundedart_api/api/routers/captures.py` (`POST /v1/captures/{capture_id}/image`):
  - validate allowed content types,
  - enforce max upload bytes,
  - ensure writes are atomic (temp file + rename),
  - define idempotency semantics for retries (e.g. overwrite-by-capture-id vs reject-if-already-has-image).
- Update storage implementation in `apps/api/src/groundedart_api/storage/local.py` to support atomic write semantics and enforce limits.
- Add settings knobs in `apps/api/src/groundedart_api/settings.py` (and `.env.example`) for allowed MIME types and max bytes.
- Extend shared error contracts in `packages/domain/schemas/` (and keep web types in sync):
  - update `packages/domain/schemas/capture_error_code.json` and `packages/domain/schemas/capture_error_response.json` with upload-related codes (e.g. `file_too_large`, `invalid_media_type`, `upload_incomplete`).
- Add focused API tests in `apps/api/tests/` (e.g. `test_capture_uploads.py`) for the new behavior.

**Contracts (API)**:
- `POST /v1/captures/{capture_id}/image` request: `multipart/form-data` with `file`.
- Response: the capture public payload including `image_url` (align with `apps/api/src/groundedart_api/api/schemas.py#CapturePublic`).
- Errors: use the standard error envelope with stable codes.

**Acceptance criteria**:
- Interrupted/failed uploads cannot leave a partially-written file as the final stored asset.
- Upload retries are safe per the chosen idempotency contract and are test-covered.
- Oversized or unsupported uploads return stable error codes the client can map to actionable UI.

**Non-goals**:
- Switching to object storage and signed URLs (see `docs/FUTUREOPTIONS.md`).

---

### M2-06 — End-to-end “weak network” verification checklist + smoke coverage

**Context (what is achieved)**: ensure the whole M2 pipeline is demoable and regressions are caught: check-in → capture intent → upload → capture visible as `pending_verification`.

**Why**: M2 is primarily about reliability and recovery. We need an explicit checklist and minimal automated coverage so the project doesn’t drift.

**Change plan (specific files)**:
- Add an explicit manual checklist in `docs/COMMANDS.md` for:
  - mobile capture, retry flows, and network throttling scenarios,
  - verifying that “capture intent” survives reload/offline.
- Add (or extend) API tests that cover the happy path from token → capture creation → image upload (and that the capture remains `pending_verification`).
  - likely touches `apps/api/tests/test_capture_tokens.py` and a new upload-focused test module.

**Acceptance criteria**:
- There is a documented, repeatable manual scenario that demonstrates recovery from a failed upload without recapture.
- Automated tests cover the API-level invariants that make the UX reliable (token single-use, upload auth, upload idempotency).

**Non-goals**:
- Verification state machine implementation (Milestone 3).

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
  - created capture has expected initial state (`pending_verification`) and key fields.
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
