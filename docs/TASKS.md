# Tasks

This file is a living checklist of buildable work items. It is intentionally explicit about **what changes**, **where**, and **how we’ll know it’s done**.

## Task template (use for new tasks)
- **Context (what/why):** what this enables and why it matters.
- **Change plan (files):** concrete file-level plan (DB, API, web, docs).
- **Contracts:** API endpoints + payload shapes + shared schemas to update.
- **Acceptance criteria:** objective outcomes; call out tests and manual checks.
- **Non-goals:** explicitly deferred scope (when relevant).

---

## Rank + gating (follow-ups)

### RG-01 — Design deterministic primary keys for rank events
- **Context (what/why):**
  - We need a stable, retry-safe idempotency strategy for future rank event types (not all will have `capture_id`).
  - The goal is deterministic event IDs derived from the event’s defining attributes (hash), so repeated submissions cannot double-count.
- **Change plan (files):**
  - Design doc updates:
    - `docs/RANK_GATING.md` (define canonical “event identity” rules)
    - `docs/DATA_MODEL.md` (describe new DB columns / constraints)
  - DB + models (proposal stage first, implement after decision):
    - Add `rank_events.deterministic_id` (or similar) and make it unique (or use it as PK).
    - Decide whether to keep `id` as a random UUID or replace it.
  - Domain:
    - Update `apps/api/src/groundedart_api/domain/rank_events.py` to generate deterministic IDs for each event type.
- **Contracts:**
  - Define required attributes per event type that feed the hash (e.g. `event_type`, `rank_version`, `source_kind`, `source_id`, and any normalization rules).
- **Acceptance criteria:**
  - Written spec for deterministic ID inputs + normalization + hashing algorithm.
  - Clear migration plan for existing `rank_events` rows and uniqueness enforcement.
- **Non-goals:**
  - Migrating all other event tables (this task is rank-events scoped).

### RG-02 — Plan rank-based visibility and “what each rank sees” (no user-facing 404/403)
- **Context (what/why):**
  - We want rank to control how much content/functionality is visible (map population, node metadata, actions) without relying on user-facing 404/403 patterns for “locked content”.
  - This needs to be an explicit product decision matrix to keep API/UI consistent and avoid leakage/UX drift.
- **Change plan (files):**
  - Add a rank visibility matrix doc section (or new doc) that defines:
    - what nodes appear on the map at each rank,
    - what node metadata is shown (name/description/category/capture counts/etc),
    - what capture content is visible,
    - what actions are enabled/disabled (check-in, capture creation, upload, report, etc).
  - Update API error/response contracts accordingly:
    - `packages/domain/schemas/*` (new/updated schemas to represent “locked” vs “visible” states)
    - `apps/api/src/groundedart_api/api/routers/nodes.py` (list/detail semantics)
    - `apps/api/src/groundedart_api/domain/gating.py` (remove any remaining “locked content” 404/403 conventions once the plan is finalized)
  - Update web UI to match:
    - `apps/web/src/routes/MapRoute.tsx` (messaging + affordances)
    - `apps/web/src/routes/NodeDetailRoute.tsx` (locked-state UI, if applicable)
- **Contracts:**
  - Decide whether “locked nodes” appear as:
    - fully hidden,
    - visible as placeholders (ID-only, coarse location, etc),
    - visible with partial metadata and explicit “unlock at rank N”.
  - Define how APIs represent those states (status codes and payload shapes).
- **Acceptance criteria:**
  - A single doc section/table that enumerates, per rank tier, all read surfaces + write surfaces and their behavior.
  - A concrete API contract proposal that avoids user-facing 404/403 for rank gating.
- **Non-goals:**
  - Implementing the full contract (this task is planning + contract definition).

## Milestone 5 — Attribution + rights (MVP → upgrade)

Roadmap source: `docs/ROADMAP.md` (Milestone 5)

**Goal:** the product cannot become a scrape/repost machine; attribution and consent are first-class.

### M5-01 — Decide and document the visibility + rights policy
- **Context (what/why):**
  - We need a single, explicit policy for (a) when a capture is visible to others, (b) what attribution/consent fields are required, and (c) how “verified” interacts with visibility.
  - Without this decision, downstream API and UI work will drift and “public post” bypasses will appear.
- **Change plan (files):**
  - Add a dedicated policy doc (recommended): `docs/ATTRIBUTION_RIGHTS.md`.
  - Cross-link from: `docs/ROADMAP.md`, `docs/PRIVACY_SECURITY.md`, `docs/DATA_MODEL.md`.
  - Capture the final field list and enum values that will become shared contracts in `packages/domain/schemas/`.
- **Contracts (decision outputs that become source of truth):**
  - **Default visibility policy**
    - Decision: `visibility = private` by default; verification does **not** auto-promote.
    - Public visibility requires explicit publish (`visibility = public`) **and** all attribution + rights requirements.
  - **Attribution required for public visibility** (final):
    - Required: `attribution_artist_name`, `attribution_artwork_title`, `attribution_source` (freeform).
    - Optional: `attribution_source_url` (URL when the source is online).
  - **Consent/rights required for public visibility** (final):
    - `rights_basis` enum: `i_took_photo`, `permission_granted`, `public_domain`
    - `rights_attestation` (boolean) with `rights_attested_at` persisted.
- **Acceptance criteria:**
  - `docs/ATTRIBUTION_RIGHTS.md` states the rules in “if/then” form and includes at least 3 examples (private draft, verified-but-not-public, public verified).
  - The doc names the exact fields/enums that must be added to shared schemas and DB.
- **Non-goals:**
  - A complete legal framework (DMCA automation, jurisdiction-specific terms, creator claims workflows).

### M5-02 — Add capture visibility + consent fields to DB and shared contracts
- **Context (what/why):**
  - We can’t enforce “no public visibility without attribution/consent” without persisted, queryable fields and shared contract definitions.
- **Change plan (files):**
  - DB + models:
    - Add new columns to `captures` via Alembic migration under `apps/api/src/groundedart_api/db/migrations/versions/`.
    - Update `apps/api/src/groundedart_api/db/models.py` (`Capture`) to include rememberable, explicit fields (no overloading `state`).
  - API schemas:
    - Update `apps/api/src/groundedart_api/api/schemas.py` capture payload types to include visibility + attribution + consent fields where needed.
    - Update `apps/api/src/groundedart_api/api/routers/admin.py` admin capture mapping if admin payloads should expose the new fields.
  - Shared domain schemas:
    - Add enums in `packages/domain/schemas/`:
      - `capture_visibility.json` (e.g., `private`, `public`)
      - `capture_rights_basis.json` (`i_took_photo`, `permission_granted`, `public_domain`)
    - Update existing request/response schemas:
      - `packages/domain/schemas/create_capture_request.json`
      - `packages/domain/schemas/capture_public.json` (or add a new “public listing” schema if we don’t want to expand `CapturePublic`)
      - `packages/domain/schemas/capture_error_code.json` (new enforcement-related codes)
      - `packages/domain/schemas/admin_capture.json` (if admin views must include new rights/visibility fields)
  - Web types:
    - Update `apps/web/src/features/captures/api.ts` types to match the chosen contract(s).
- **Contracts:**
  - DB (minimum):
    - `captures.visibility` (`private|public`)
    - `captures.rights_basis` (enum)
    - `captures.rights_attested_at` (timestamp)
    - `captures.attribution_source` (string)
    - `captures.attribution_source_url` (optional string)
  - API payload(s) must carry enough data for UI to:
    - show why a capture is not public (missing fields / not verified),
    - show attribution alongside any publicly visible image.
- **Acceptance criteria:**
  - Alembic migration applies cleanly on a fresh DB and on an existing dev DB.
  - Shared schemas in `packages/domain/schemas/` and API Pydantic models in `apps/api/src/groundedart_api/api/schemas.py` agree on field names and allowed enum values.
- **Non-goals:**
  - Introducing Artwork/Artist tables or claim flows (those are separate domain expansions).

### M5-03 — Enforce “public visibility requires attribution + consent” on the read path
- **Context (what/why):**
  - The roadmap exit criterion is specifically about **bypasses**: if any discovery/detail endpoint can return an image to non-owners without required fields, we’ve failed M5.
- **Change plan (files):**
  - Implement a single policy function used everywhere:
    - New module: `apps/api/src/groundedart_api/domain/attribution_rights.py`
      - `is_capture_publicly_visible(capture: Capture) -> bool`
      - `missing_public_requirements(capture: Capture) -> list[str]` (for explainability)
  - Apply the policy to node detail capture listings:
    - Update `apps/api/src/groundedart_api/api/routers/nodes.py:list_node_captures` to:
      - keep admin override behavior for `state != verified`,
      - for non-admin/verified listings, filter to captures that are both:
        - `state == verified`, and
        - `is_capture_publicly_visible(...) == True`.
  - Prevent accidental URL leakage:
    - Update `apps/api/src/groundedart_api/api/routers/captures.py:capture_to_public` (or a new mapping function) to avoid returning `image_url` for captures that are not meant to be visible to the requesting principal.
      - If needed, introduce an “owner view” vs “public view” mapping, rather than overloading one type.
  - Tests:
    - Add API tests under `apps/api/tests/` that cover visibility enforcement on `GET /v1/nodes/{node_id}/captures`.
- **Contracts:**
  - `GET /v1/nodes/{node_id}/captures` (non-admin) must never return an `image_url` for a capture that:
    - is not `verified`, or
    - does not satisfy attribution + consent requirements per M5-01, or
    - is explicitly `private` (if `visibility` exists).
  - If we add new error codes for “publish” actions, they must be reflected in:
    - `packages/domain/schemas/capture_error_code.json`
    - `apps/web/src/features/captures/api.ts:CaptureErrorCode`
- **Acceptance criteria:**
  - A verified capture with missing attribution/consent does not appear in node capture listings for normal users.
  - Admin listing behavior is unchanged (admin can still review non-verified states via existing admin auth).
  - Tests demonstrate the bypass is closed (at least one positive and one negative case).
- **Non-goals:**
  - Fully access-controlled media delivery (signed URLs / auth-checked media routes). M5 should avoid *API-disclosed* leaks; storage hardening is a follow-on.

### M5-04 — Add an explicit “publish” path (and keep default conservative)
- **Context (what/why):**
  - Today, attribution fields exist but are optional and there is no explicit “publish” concept; we need a server-enforced way to keep captures private by default, while allowing creators to make them visible once requirements are met.
- **Change plan (files):**
  - API:
    - Add an owner-only endpoint to update attribution/consent fields post-capture:
      - Recommended: `PATCH /v1/captures/{capture_id}` (owner only).
    - Add an owner-only “request public” endpoint or field transition:
 Decision: `POST /v1/captures/{capture_id}/publish` (clear intent; easy to audit).
    - Implement server-side validation that blocks publishing unless:
      - capture is `verified` (or matches the chosen policy in M5-01),
      - required attribution fields are present and non-empty,
      - consent/rights fields are present per M5-01.
  - Shared schemas:
    - Add/update request/response schemas in `packages/domain/schemas/` for the new endpoint(s).
  - Web:
    - Update `apps/web/src/features/captures/CaptureFlow.tsx` to collect attribution + consent in-flow (before publish or as part of publish).
    - Update `apps/web/src/routes/NodeDetailRoute.tsx` to display attribution next to any capture that’s visible.
  - Tests:
    - API tests for publish validation and for the “default is private” behavior.
- **Contracts:**
  - New endpoint(s) (final names decided in this task) must return stable error codes for:
    - “not verified yet”
    - “missing attribution”
    - “missing consent/rights”
  - The “publish” mechanism must be auditable (either via capture events or a new event type).
- **Acceptance criteria:**
  - A newly created capture remains non-public by default (per M5-01).
  - Publishing fails with explainable errors until requirements are met; once met, the capture becomes visible in `GET /v1/nodes/{node_id}/captures`.
  - Node detail UI shows attribution for visible captures.
- **Non-goals:**
  - Social sharing links, public web pages, SEO/indexing, or any “feed” concept.

### M5-05 — Reporting + takedown primitives (manual-first)
- **Context (what/why):**
  - Even with conservative defaults, the system needs a first-class way to report problematic content and to take it down quickly with an audit trail.
- **Change plan (files):**
  - DB + models:
    - Add a `content_reports` table (or similarly named) via Alembic migration:
      - references `capture_id` (and optionally `node_id`)
      - reporter `user_id` (nullable if we decide to allow unauthenticated reports)
      - `reason` enum/string + freeform `details`
      - `created_at`, `resolved_at`, `resolution` fields
    - Update `apps/api/src/groundedart_api/db/models.py` with the new model.
  - API (user-facing):
    - Add `POST /v1/captures/{capture_id}/reports` (or `POST /v1/reports`) to create a report.
    - Rate limit and record abuse events if spammy (reuse `apps/api/src/groundedart_api/domain/abuse_events.py` patterns).
  - API (admin-facing):
    - Extend `apps/api/src/groundedart_api/api/routers/admin.py` with:
      - `GET /v1/admin/reports` (queue)
      - `POST /v1/admin/reports/{report_id}/resolve`
    - On resolution, admins can hide a capture via existing moderation transition machinery.
  - Domain:
    - Extend reason codes to include rights/reporting outcomes:
      - `packages/domain/schemas/capture_state_reason_code.json`
      - `apps/api/src/groundedart_api/domain/capture_state_reason_code.py`
  - Web:
    - Add a minimal “Report” action from the node detail capture UI (`apps/web/src/routes/NodeDetailRoute.tsx`).
  - Tests:
    - API tests for report creation, admin listing, and resolution that hides a capture.
- **Contracts:**
  - Add reporting schemas in `packages/domain/schemas/` (exact names to decide in this task), e.g.:
    - `report_reason_code.json`
    - `create_report_request.json`, `create_report_response.json`
    - `admin_reports_response.json`, `admin_report_resolve_request.json`
  - Takedown should map to `CaptureState.hidden` with a distinct reason code (e.g., `report_hide`, `rights_takedown`) to keep auditability.
- **Acceptance criteria:**
  - Users can file a report against a capture they can see.
  - Admin can review reports, mark them resolved, and hide the referenced capture.
  - A hidden capture no longer appears in `GET /v1/nodes/{node_id}/captures` and its `image_url` is not disclosed through public listing payloads.
- **Non-goals:**
  - Automated detection (copyright matching, ML moderation), creator self-serve takedowns, or legal intake workflows.

### M5-06 — (Optional) Tip receipt integration behind an adapter boundary
- **Context (what/why):**
  - We want to support “proof of tip” later without coupling the core capture pipeline to any specific payments/on-chain system.
- **Change plan (files):**
  - Define an adapter boundary:
    - New protocol/module: `apps/api/src/groundedart_api/domain/tip_receipts.py` (interface + data model).
    - Dependency injection wiring similar to `apps/api/src/groundedart_api/domain/verification_events.py`.
  - Add optional capture fields only if we need persistence in MVP:
    - DB migration + `apps/api/src/groundedart_api/db/models.py` fields such as `tip_receipt_provider`, `tip_receipt_ref` (names to be decided).
  - Add docs:
    - `docs/ATTRIBUTION_RIGHTS.md` should note the adapter and that it’s off by default.
- **Contracts:**
  - No external provider contract is committed in MVP; any provider-specific payload must be encapsulated behind the adapter and be feature-flagged.
- **Acceptance criteria:**
  - The codebase has a clear adapter seam where tip receipts could be integrated later without changing capture core flows.
- **Non-goals:**
  - Implementing or deploying a real tip provider integration in MVP.
