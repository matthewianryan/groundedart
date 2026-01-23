# Roadmap

This file translates the product intent into buildable milestones, ordered by **system dependency** (not desirability).

Grounded Art only “works” when the full loop exists:
**map-first discovery → proof-of-presence → capture/upload → verification → rank/gating → attribution/rights**.

## Dependency rules (non-negotiables)
- **Map substrate before node seeding**: integrate Google Maps (JS API + React wrapper) and viewport plumbing first; only then spend time on datasets and rendering markers.
- **Google Maps Platform is the geo stack**: use the Google Maps ecosystem (Maps JavaScript, Directions, Places/Geocoding) for map, routing, and location search; keys must be scoped and documented.
- **Server is the authority**: geo enforcement, state transitions, and gating must be API-level decisions (UI-only gating doesn’t count).
- **Verification precedes rank**: rank is derived from verified actions, not raw submissions.
- **Attribution is part of the data model**: not a “later metadata field” bolted onto public posting.

## Milestone 0 — Demoable discovery (MVP)
**Goal:** a user can open the app, pan/zoom a map, see starter nodes, and open a node detail view.

Deliverables (do in order):
1. **Map substrate (Google Maps)**
   - Base map renders reliably on mobile (Maps JS API + basic styling) with required Google libraries (Directions + Places/Geocoding) loaded.
   - Viewport state is captured (center/zoom/bounds) with debounced fetch triggers.
2. **Node read path**
   - A stable node payload shape (`NodePublic`) and a read API that supports viewport queries (bbox/radius).
   - Seed dataset exists *because the map substrate is ready to render it*.
3. **Node detail**
   - Node metadata view.
   - “Verified captures” section with empty state (even if capture creation is not built yet).

Exit criteria:
- Local dev is repeatable (`apps/api` + `apps/web` can be run from clean checkout).
- Panning the map triggers node fetches without jank, and selecting a marker opens a detail view.

## Milestone 1 — On-site check-in (MVP)
**Goal:** a user can only begin a capture flow when physically inside a node’s geofence.

Deliverables:
- Geofence model for nodes (radius or polygon; pick one and make it authoritative).
- Server-side check-in flow (challenge/nonce + expiring token + replay protection).
- UX for “not inside the zone” that accounts for GPS accuracy and intermittent connectivity.

Exit criteria:
- The API can explain check-in failures with stable reason codes.
- A valid token is required for downstream capture creation (even if upload is mocked initially).

## Milestone 2 — Capture + upload (MVP)
**Goal:** a user can capture and upload a photo reliably on weak mobile networks.

Deliverables:
- Camera capture flow with client-side resize/compression.
- Resilient uploads (retry-only for M2; resumable is a future upgrade — see `docs/FUTUREOPTIONS.md`).
- Canonical ordering for M2: `POST /v1/captures` (consumes check-in token) → `POST /v1/captures/{id}/image` (retryable; API-terminated storage).
- Source of truth for ordering/contracts: `docs/ARCHITECTURE.md` (Capture + upload).
- Capture record creation requires a valid, unused check-in token and writes a `pending_verification` capture.

Exit criteria:
- Upload failures are recoverable without losing the capture intent.
- A capture can be created end-to-end from the device, bound to a node visit.

## Milestone 3 — Verification state machine (MVP)
**Goal:** the system can turn a capture into trusted content through explicit, auditable states.

Deliverables:
- Capture states: `draft` → `pending_verification` → `verified` / `rejected` / `hidden` (+ reason codes).
- Basic anti-abuse (rate limits, per-node caps, suspicious behavior tracking).
- Async hooks for future scoring/similarity (can be no-op at first, but the boundary exists).
- Minimal moderation interface or admin endpoint to transition states with audit log.

Exit criteria:
- State transitions are server-enforced, testable, and explainable.
- “Verified captures” on node detail is powered by real verification state.

## Milestone 4 — Rank + gating (MVP)
**Goal:** users unlock nodes/features based on verified contributions; discovery improves as trust grows.

Deliverables:
- Rank computation rules + an auditable event log (derive from verified actions only).
- API-level gating for:
  - which nodes are visible in discovery
  - who can create captures / how often
- UX that explains unlocks and requirements in plain language.

Exit criteria:
- Gating is enforced on the read path (discovery), not only on write paths.
- Users can understand “why” they can/can’t see or do something.

## Milestone 5 — Attribution + rights (MVP → upgrade)
**Goal:** the product cannot become a scrape/repost machine; attribution and consent are first-class.

Deliverables:
- Required attribution + consent fields for public visibility.
- Default visibility policy that is conservative until verified (decide explicitly).
- Reporting/takedown primitives (can be manual initially).
- Optional tip receipt integration behind an adapter boundary (later).

Exit criteria:
- There is no “public post” path that bypasses attribution/consent requirements.

## Milestone 6 — Observability (cross-cutting; start early)
**Goal:** demo failures and real-world issues are diagnosable.

Deliverables:
- Structured logs + request IDs across the API.
- Metrics/tracing for critical paths (node discovery, check-in, uploads, verification transitions).
