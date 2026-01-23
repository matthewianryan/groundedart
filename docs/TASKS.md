# Tasks

This file is the **active milestone task checklist**.

- Milestones **0–3** are implemented in this repo; see `docs/M0.md`, `docs/M1.md`, `docs/M2.md`, `docs/M3.md`.
- The next milestone is **Milestone 4 — Rank + gating (MVP)** from `docs/ROADMAP.md`.

---

## Milestone 4 — Rank + gating (MVP)

Goal (per `docs/ROADMAP.md`): users unlock nodes/features based on verified contributions; discovery improves as trust grows.

### M4-01 — Decide rank rules + gating policy (design + contracts)

**Context (what/why)**
- M4 requires rank to be **derived from verified actions only** and to be explainable/auditable.
- The repo currently stores `curator_profiles.rank`, but there is **no rank event log** and no documented rank computation rules (`docs/TOADDRESS.md`).
- Without a clear policy, the system can’t honestly explain unlocks (“why can/can’t I see/do this?”) and we can’t write stable tests.

**Decision points (pick explicitly; do not “let code decide”)**
- Rank computation model (choose one for MVP; can evolve later):
Decision: Simple Points System: +N per verified capture (with per-node/day caps).
     - Pros: simplest; easy to audit; low product ambiguity.
     - Cons: can incentivize spam unless caps/anti-abuse are strong.
- What happens when verified content is later moderated (e.g., `verified → hidden`)?
Decision: rank is **recomputed** from current “still-verified” content (rank can go down).
- Gating surface (minimum required by ROADMAP):
  - Discovery read path: already filters by `nodes.min_rank`, but must be driven by the new rank system.
  - “Who can create captures / how often”: decide which actions are rank-tiered (capture create frequency, check-in issuance limits, per-node caps).

**Change plan (specific files)**
- Add policy doc:
  - `docs/RANK_GATING.md` (new): computation rules, examples, tier table, and “why” language guidelines.
  - Update cross-references in `docs/ROADMAP.md` and/or `docs/ARCHITECTURE.md` (small link-only change).
- Define new shared contract primitives (names may vary, but must be versioned and testable):
  - `packages/domain/schemas/rank_event.json` (new)
  - `packages/domain/schemas/rank_event_type.json` (new enum)
  - `packages/domain/schemas/rank_events_response.json` (new)
  - `packages/domain/schemas/me_response.json` (new or update existing `MeResponse` contract approach)

**Contracts (must be explicit)**
- Decide whether `/v1/me` is expanded or a new endpoint is introduced:
Decision: extend `GET /v1/me` to include rank breakdown + next unlock.

**Acceptance criteria**
- `docs/RANK_GATING.md` explains:
  - exactly which verified actions generate rank,
  - how rank is computed from the event log,
  - how rank changes (or doesn’t) after moderation,
  - at least 3 concrete examples (“rank 0 → 1”, “repeat captures at same node”, “moderated content”),
  - the specific gating rules/tier thresholds applied by the API.

**Non-goals**
- No “perfect” scoring model; MVP should optimize for clarity + auditability.
- No new “quality scoring” features (belongs to verification/scoring upgrades; see `docs/FUTUREOPTIONS.md`).

---

### M4-02 — Add an append-only rank event log (DB + domain model)

**Context (what/why)**
- M4 requires an **auditable event log** so rank can be derived, debugged, and explained.
- The existing capture audit log (`capture_state_events`) shows verification transitions, but there is no rank-side ledger.

**Change plan (specific files)**
- DB model + migration:
  - `apps/api/src/groundedart_api/db/models.py`: add `CuratorRankEvent` (name TBD) model.
  - `apps/api/src/groundedart_api/db/migrations/versions/*_rank_events.py` (new Alembic migration).
- Domain service:
  - `apps/api/src/groundedart_api/domain/rank_events.py` (new): append-only write helpers + idempotency guard.
- API schemas:
  - `apps/api/src/groundedart_api/api/schemas.py`: add `RankEvent`/`RankEventsResponse` models (or wire via separate module if preferred).
- Shared JSON schemas:
  - `packages/domain/schemas/rank_event*.json` (from M4-01).

**Contract sketch (minimum fields; align with shared schemas)**
- `rank_events` (table):
  - `id` (uuid), `user_id` (uuid), `event_type` (string enum), `delta` (int), `created_at` (timestamptz)
  - linkage fields for auditability: `capture_id` (uuid, nullable), `node_id` (uuid, nullable)
  - `details` (jsonb, nullable) for explainability without schema churn
- Idempotency:
  - A uniqueness constraint to prevent duplicate events for the same underlying trigger, e.g.:
    - `(event_type, capture_id)` if capture verification is the only source in MVP, or
    - `(event_type, source_kind, source_id)` for extensibility.

**Acceptance criteria**
- A rank event can be written for a user with stable linkage to the triggering capture/node.
- Duplicate writes for the same trigger are rejected (or treated as a no-op) deterministically.
- Events are queryable by user in chronological order with a stable response schema.

**Non-goals**
- No background workers required for MVP; rank events can be emitted inline with verification transitions.

---

### M4-03 — Implement rank projection (derive rank from events) + backfill

**Context (what/why)**
- Gating must rely on rank derived from rank events, not a manually-updated integer.
- Projection is needed to efficiently answer “current rank” during node discovery and write gates.

**Change plan (specific files)**
- Projection logic:
  - `apps/api/src/groundedart_api/domain/rank_projection.py` (new): compute rank from events and/or maintain a cached snapshot.
  - `apps/api/src/groundedart_api/db/models.py`: optionally extend `CuratorProfile` to store snapshot metadata (e.g., `rank_updated_at`, `rank_version`).
- API integration:
  - `apps/api/src/groundedart_api/api/routers/me.py`: return rank derived from projection; optionally include “next unlock” info.
  - `apps/api/src/groundedart_api/api/routers/nodes.py`: use projected rank for read gating.
- Backfill tooling:
  - `apps/api/scripts/backfill_rank_events.py` (new): create rank events from existing verified captures (and/or state events) in a safe, idempotent way.

**Contracts**
- If a “rank explanation” UX is in-scope, decide and expose:
  - breakdown summary (e.g., total verified contributions counted, caps applied),
  - next unlock threshold and what it unlocks (at least in generic terms).

**Acceptance criteria**
- Rank returned by the API is reproducible by recomputing from the rank event log.
- Running backfill twice does not create duplicates and does not change computed rank.
- Node discovery read gating continues to function with projected rank (no regression to anonymous rank=0 behavior).

**Non-goals**
- No real-time push updates; polling/refresh is acceptable for MVP.

---

### M4-04 — Emit rank events from verified actions (verification → rank)

**Context (what/why)**
- Rank must be derived from **verified actions only**. In the current system, the most concrete verified action is a capture transitioning to `verified`.

**Change plan (specific files)**
- Hook points (choose the authoritative emission point and keep it centralized):
  - `apps/api/src/groundedart_api/domain/capture_moderation.py`: emit rank event when `target_state=verified` succeeds.
  - `apps/api/src/groundedart_api/api/routers/admin.py`: ensure admin transitions flow through the same domain function (already does).
  - (Optional) `apps/api/src/groundedart_api/domain/verification_events.py`: if rank should also be emitted by async hooks later, define the boundary now but keep MVP inline.
- Tests:
  - `apps/api/tests/test_rank_events.py` (new): verifying a capture creates exactly one rank event and updates projected rank.

**Contracts**
- Rank event type(s) for MVP:
  - `capture_verified` (required)
  - Decide whether `capture_unverified`/`capture_hidden` exists for moderation reversals (from M4-01).

**Acceptance criteria**
- Transitioning a capture to `verified` results in:
  - a new rank event row (idempotent),
  - updated rank projection output for that user.
- If moderation reversal affects rank (per M4-01), reversing the state updates rank deterministically and is auditable.

**Non-goals**
- No user-to-user endorsements, likes, or social reputation signals in MVP.

---

### M4-05 — Rank-based gating enforcement (read + write paths)

**Context (what/why)**
- ROADMAP requires gating at the API level for:
  - which nodes are visible in discovery (read path),
  - who can create captures / how often (write path),
  - with UX support that can explain requirements without relying on client-side hiding.

**Change plan (specific files)**
- Centralize gating rules:
  - `apps/api/src/groundedart_api/domain/gating.py` (new): helpers like `assert_can_view_node(...)`, `assert_can_checkin(...)`, `assert_can_create_capture(...)`.
- Apply to endpoints:
  - `apps/api/src/groundedart_api/api/routers/nodes.py`: list/detail gating uses projected rank (retain current “filtered out” behavior for locked nodes).
  - `apps/api/src/groundedart_api/api/routers/nodes.py`: check-in challenge + check-in should enforce node gating policy (decision from M4-01).
  - `apps/api/src/groundedart_api/api/routers/captures.py`: capture creation should enforce rank-tiered frequency limits and/or per-node requirements (decision from M4-01).
- Contracts + error codes:
  - Extend existing error enums (preferred) or add a new gating enum:
    - `packages/domain/schemas/capture_error_code.json` (add codes like `insufficient_rank`, `feature_locked`, if applicable)
    - `packages/domain/schemas/node_error_code.json` (if any new node gating codes are exposed)
  - Mirror in API/web error handling.

**Acceptance criteria**
- Gating is enforced on the discovery read path (existing `min_rank` behavior continues, driven by projected rank).
- At least one write-path gate is rank-dependent (not just time-window rate limiting), and is enforced server-side with stable error codes/details.
- Anonymous users remain supported (rank defaults to 0; gating is consistent).

**Non-goals**
- No client-only gating; the client may *explain*, but the server must *enforce*.

---

### M4-06 — “Unlock” UX: explain rank and requirements in plain language (web)

**Context (what/why)**
- Users must understand why discovery is sparse and what actions unlock more access.
- The UI already displays `node.min_rank` on node detail, but it does not expose current user rank, progress, or “next unlock”.

**Change plan (specific files)**
- API client + types:
  - `apps/web/src/features/me/api.ts` (new or extend existing patterns): fetch rank/progress endpoint(s).
  - `apps/web/src/features/me/types.ts` (new): `MeResponse` (and progress payload if added).
- UI:
  - `apps/web/src/routes/MapRoute.tsx`: show current rank + next unlock guidance (non-intrusive, map-first).
  - `apps/web/src/routes/NodeDetailRoute.tsx`: show “You are rank X; this node requires Y” when available (without leaking locked nodes beyond what’s already visible).
  - `apps/web/src/routes/CaptureRoute.tsx` / `apps/web/src/features/captures/CaptureFlow.tsx` (as applicable): show rank-based restrictions when capture creation is blocked.

**Contracts**
- Copy requirements (keep it consistent):
  - “Current rank”
  - “To unlock more, verify N more captures” or “verify at a new node” (depends on rank model)
  - “Why can’t I post?” messaging maps to stable API reason codes.

**Acceptance criteria**
- A user can see:
  - their current rank,
  - what they need to do to unlock the next tier (in plain language),
  - when an action is blocked, the UI explains the requirement without vague errors.

**Non-goals**
- No gamified leaderboards or social feeds in MVP.
