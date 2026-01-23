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
