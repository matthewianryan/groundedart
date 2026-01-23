# Future options

RefResolver is being removed in a future jsonschema release; they want people to use the referencing library APIs instead. Not necessary to be addressed during hackathon timeframe. 

This document records **intentionally deferred** design options so we can revisit them without re-litigating history or accidentally promising them in MVP milestones.

The canonical Milestone 2 approach is documented in `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`:
- **Ordering**: create capture → upload image
- **Storage**: API-terminated
- **Resilience**: retry-only (no resumable protocol in M2)

## Option: Upload asset first, then create capture (asset-referenced captures)

### Functional change (what it means)
Instead of creating a capture record first, the client uploads image bytes to a **temporary asset** (or directly to object storage), then creates the capture by referencing that uploaded asset.

High-level flow:
1. Client captures + preprocesses an image.
2. Client uploads bytes and receives an `asset_id` (or `object_key`).
3. Client calls `POST /v1/captures` with:
   - `checkin_token` (consumed here)
   - `node_id`
   - attribution fields
   - `asset_id` / `object_key` reference
4. API validates token and finalizes the capture in `pending_verification` pointing at the uploaded media.

### Pros
- Avoids “dangling captures” that never receive an image.
- Fits naturally with direct-to-object-storage and true resumable/multipart uploads.
- Makes “upload session” and “media integrity checks” first-class.

### Cons / risks
- Check-in tokens are short-lived; uploads on weak networks can outlast the token TTL, causing create-capture to fail after a successful upload.
  - Mitigation options (each adds complexity): longer token TTL, token “reservation”, or a separate server-issued upload session bound to the check-in token.
- Requires asset lifecycle management (cleanup of abandoned temporary uploads).
- Requires additional contracts (asset identifiers, ownership, and authorization semantics).

### Likely contract additions (illustrative, not committed)
- A new “upload init” or “asset create” endpoint that issues an `asset_id` and (optionally) signed upload URLs.
- A finalize step or strict validation that the referenced asset exists, is owned by the session user, and matches content-type/size constraints.

## Option: Direct-to-object-storage uploads with signed URLs

### Functional change (what it means)
The API does not receive image bytes. Instead it issues **signed URLs** (and constraints) and the browser uploads directly to storage (S3/R2/etc). The API remains authoritative by issuing upload permissions and by finalizing capture records.

High-level flow:
1. Client requests an upload URL/session from the API.
2. Client uploads directly to storage using the signed URL.
3. Client creates/finalizes the capture referencing the uploaded object.

### Pros
- Offloads upload bandwidth from the API; easier to scale.
- Enables storage-native multipart uploads and resumability.
- Reduces tail latency impact on API request handling.

### Cons / risks
- More moving parts: storage CORS, signed URL issuance, object lifecycle cleanup, and abuse controls.
- The API must not trust arbitrary client-provided object keys; a finalize step is typically required.
- Local development ergonomics become more complex (needs local storage emulator or conditional paths).

## Option: True resumable uploads (tus protocol or S3 multipart)

### Functional change (what it means)
Uploads can resume from a known offset after disconnects, instead of restarting from byte 0.

Two common approaches:
- **tus**: protocol + server that tracks offsets and upload URLs.
- **S3/R2 multipart**: storage-native multipart sessions with part upload + completion.

### Pros
- Best success rate on weak networks, especially for large images.
- Better UX for intermittent connectivity (resume instead of restart).

### Cons / risks
- Requires additional server/state management (upload sessions, cleanup, timeouts).
- Requires careful authorization: uploads must be bound to the user/session and to a specific capture/intent.
- Adds edge cases (out-of-order chunks, partial completion, verification of completed object size/hash).

### Interaction with check-in tokens (important)
If a check-in token must be consumed before upload begins, you need an idempotent “intent” record or upload session that:
- proves the user checked in for `(node_id, user_id)` within the time window, and
- survives long uploads without allowing token replay for multiple captures.

## When to revisit these
- When M2 reliability targets can’t be met with preprocessing + retry-only.
- When API bandwidth/cost becomes a bottleneck.
- When mobile uploads regularly exceed acceptable timeouts even after compression.

