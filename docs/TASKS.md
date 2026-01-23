# Tasks

This file tracks build tasks with enough detail to implement without guessing. It currently focuses on **Milestone 2** from `docs/ROADMAP.md`.

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
