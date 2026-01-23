# Data model (conceptual)

This is a shared vocabulary for product + engineering. It is intentionally implementation-agnostic; the first DB schema should be a direct translation of these entities and relationships.

## Core entities

### User
- A person using the app.
- Owns captures and has a computed curator profile/rank.

### Node
- A physical place users can visit.
- Has a geometry (MVP: center point + radius_m, with `radius_m >= 25`) and metadata (name, description, category).

### Artwork
- An identifiable piece associated with a node (or optionally independent, if the same piece appears elsewhere).
- Has reference images and canonical attribution fields.

### Artist
- The creator (or collective) of an artwork.
- Can be unclaimed (string credit) or claimed/verified later.

### Capture
- A user-submitted photo bound to `(user, node, time)` and optionally linked to an artwork.
- Has a verification state and an audit trail of evidence.

### Verification
- A record of checks performed on a capture: geo pass, time window, similarity score, moderation outcome.
- Should be explainable (store reason codes).

### Curator profile (rank)
- Derived from verified actions (captures, endorsements, moderation approvals).
- Used for feature gating (which nodes/content a user can see or do).

### Rank event (rank_events)
- Append-only ledger of rank-affecting actions.
- Canonical input for rank computation and rebuildable materialization caches.

Proposed concrete fields (DB):
- `id` (UUID, PK): internal row identifier (random UUID).
- `deterministic_id` (string, unique): retry-safe idempotency key derived from the event identity spec in `docs/RANK_GATING.md`.
- `user_id` (FK): the user whose rank changes.
- `event_type` (string): semantic event type (`capture_verified`, …).
- `rank_version` (string): scoring/version namespace (`v1_points`, …).
- `delta` (int): points change for this version/type.
- `capture_id` (nullable FK): present for capture-derived events.
- `node_id` (nullable FK): optional denormalized reference for projection/caps.
- `created_at` (timestamp): audit ordering (not part of deterministic identity).
- `details` (JSON): audit/debug payload (not part of deterministic identity).

Constraints:
- Uniqueness is enforced on `deterministic_id` so retries cannot double-count.
- Do not enforce uniqueness on `(event_type, capture_id)` alone (it does not cover events without `capture_id`, and it prevents multiple `rank_version`s for the same source).

Migration plan (existing `rank_events` rows):
1. Add nullable `rank_events.deterministic_id`.
2. Backfill `deterministic_id` for existing rows using the canonical identity spec.
   - For current `capture_verified` rows: `source_kind="capture"`, `source_id=capture_id`.
3. Add a unique constraint on `deterministic_id` and make it non-null.
4. Remove the legacy uniqueness constraint on `(event_type, capture_id)` once backfill is complete.

## Key relationships (high level)
- `Node` 1—* `Capture`
- `Artwork` 1—* `Capture` (optional link for early MVP; can be strict later)
- `Artist` 1—* `Artwork`
- `User` 1—* `Capture`
- `Capture` 1—* `Verification`

## Policy fields to design early
- **Attribution policy**: required fields for public visibility (see `docs/ATTRIBUTION_RIGHTS.md`).
- **Consent/rights flags**: `rights_basis` + attestation required for public visibility (see `docs/ATTRIBUTION_RIGHTS.md`).
- **Moderation state**: `draft`, `pending`, `verified`, `rejected`, `hidden`.
