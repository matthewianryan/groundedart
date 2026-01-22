# Architecture

## Design intent (what we are building)
Grounded Art is not “a map with photos”; it is a *trust pipeline* that turns real-world presence into high-quality, attributable, reusable media about local art.

The product’s competitive advantage comes from two coupled ideas:
1. **Ground truth**: content is tied to a physical place and time (proof-of-presence).
2. **Progressive unlocks**: the system reveals more value to users who create trust (rank gating).

If this works, the app becomes a reliable local discovery layer that can eventually support communities, artist engagement, and value transfer.

## Core principles
- **Server-enforced truth**: the client can assist, but the server decides what counts (geo, time windows, rate limits).
- **Progressive trust**: early constraints are tighter; unlocks are earned via verified behavior.
- **Privacy by default**: store the minimum location data needed to verify (avoid tracking trails).
- **Asynchronous by design**: uploads and verification must tolerate weak networks.
- **Attribution-first**: credit and consent are not “nice-to-have”; they are part of the data model.

## System boundaries (MVP vs upgrades)
### MVP (must have)
- Map-first discovery of nodes (seed data is fine initially).
- On-site check-in that proves the user is inside a node’s geofence.
- Capture + upload with metadata + attribution fields.
- Verification state machine (even if “lightweight” at first).
- Reputation/rank and feature gating.

### Upgrades (later)
- Perceptual similarity at scale, better quality scoring, creator tools.
- Artist claim flows, moderation queues, community verification.
- On-chain tips/receipts and “pay-to-post” gating for some actions.

## Domain vocabulary
- **Node**: a physical place users can visit (gallery, mural wall, sculpture location).
- **Artwork**: an identifiable piece (can have multiple reference images).
- **Artist**: a creator entity (may be claimed/verified later).
- **Capture**: a user-submitted photo associated with a node/artwork and a verification attempt.
- **Verification**: the evidence and decisions that turn a capture into “trusted”.
- **Curator rank**: a computed trust score used to unlock features and nodes.

See `docs/DATA_MODEL.md` for relationships.

## Component model
At a systems level, Grounded Art is three things:
1. **Client** (web/PWA): map UI, capture UI, local validation, upload/resume.
2. **Core API**: authoritative geo enforcement, identity/session, reads/writes, gating.
3. **Media + verification pipeline**: async jobs that score, compare, and promote images.

Recommended infrastructure building blocks:
- **Postgres + PostGIS** for geo queries, gating, and auditability.
- **Object storage** (S3-compatible) for media.
- **Job runner** (queue + workers) for verification and quality scoring.

## Data flows (critical paths)

### 1) Discovery (map browsing)
Goal: show nodes in view while enforcing rank gating.

Flow:
1. Client requests nodes in a bounding box (or radius).
2. API returns only nodes allowed for the user’s rank + policy.
3. Client renders nodes; detail view pulls node + top captures.

Key design choice: **gating must happen at the API**, not just by hiding UI.

### 2) On-site check-in (proof-of-presence)
Goal: allow capture only when the user is physically inside a node’s geometry.

Flow:
1. Client requests a short-lived check-in challenge (nonce).
2. Client reads current location (device GPS) and submits it with the nonce.
3. API verifies:
   - user session is valid
   - nonce is unused + unexpired
   - point is inside node polygon / within radius
   - rate limits (per user/per node)
4. API issues a short-lived **check-in token** bound to `(user, node, time window)`.

Why this matters: it prevents simple replay and makes “upload later from anywhere” harder.

### 3) Capture + upload
Goal: reliably upload photos on weak networks without corrupting trust.

Flow:
1. Client captures an image and applies a *mobile-friendly* preprocessing step (resize/compress).
2. Client uploads to storage (prefer resumable uploads when possible).
3. Client creates a capture record referencing the stored asset and includes:
   - check-in token
   - timestamps
   - attribution fields (artist name, artwork title, consent flags)
4. API validates token and stores capture in `pending_verification`.

### 4) Verification + promotion
Goal: decide whether a capture is “trusted” and whether it becomes a node’s primary image.

Verification is layered:
- **Hard gates (authoritative)**: check-in success, time window, rate limits.
- **Soft signals**: perceptual similarity to reference images, EXIF plausibility, duplicate detection.
- **Human/artist review** (later): confirm/deny edge cases and claims.

Promotion strategy:
- Maintain a “best image” per node/artwork using a **quality score** and trust score.
- Store the score breakdown for auditability (users should be able to understand rank outcomes).

## Quality scoring (image selection)
The user intent describes a “matrix” for best image (resolution, glare, obstruction, quality).

Implementation guidance:
- Treat quality scoring as a **pure function** over an image + basic metadata.
- Run it asynchronously and store the score and extracted features (not the whole derived image).
- Start simple (sharpness + exposure + resolution + face/obstruction heuristics), then iterate.

Design constraint: quality scoring should **not** be required to accept a capture; it should only affect ranking and promotion.

## Trust + anti-abuse posture
Primary abuse cases:
- GPS spoofing / location manipulation
- Uploading old photos / screenshots
- Mass spam to farm rank
- Harassment/defamation via uploads
- Copyright misuse / lack of consent

Mitigations (MVP-appropriate):
- Server-side geofence enforcement and short-lived tokens.
- Time window constraints and per-node/per-user rate limits.
- Duplicate detection (perceptual hash) where feasible.
- Reputation derived from *verified* actions; suspicious actions reduce trust.
- Clear reporting/moderation primitives (even if manual initially).

See `docs/PRIVACY_SECURITY.md` for more.

## Recommended implementation approach (pragmatic MVP)
To minimize moving parts while preserving clean boundaries:
- Start with a single “core API” that owns verification, gating, and data integrity.
- Keep media verification and scoring in a worker process (same repo, separate deploy unit).
- Keep blockchain integration behind an adapter boundary; do not bake chain calls into core flows.

This supports hackathon velocity while keeping the system evolvable.

