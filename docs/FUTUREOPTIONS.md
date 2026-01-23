# Future options

RefResolver is being removed in a future jsonschema release; they want people to use the referencing library APIs instead. Not necessary to be addressed during hackathon timeframe. 

This document records **intentionally deferred** design options so we can revisit them without re-litigating history or accidentally promising them in MVP milestones.

The canonical Milestone 2 approach is documented in `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`:
- **Ordering**: create capture → upload image
- **Storage**: API-terminated
- **Resilience**: retry-only (no resumable protocol in M2)

## Related tasks (tracking)

Concrete implementation work lives in `docs/TASKS.md`, especially:
- M5-07a…M5-07g (Solana-native tipping tasks).
- M5-06 (optional) tip receipt adapter boundary.

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

## TODO: Solana-native tipping (hackathon plan)

Canonical decisions (hackathon scope; Solana-native, SOL-only)

- **Chain**: Solana devnet only.
- **Assets**: **SOL-only** (no USDC/SPL tokens).
- **On-chain integration**: **no custom program deployment**; use a plain SOL transfer + **Memo** containing `tip_intent_id`.
- **Receipts**: API verifies the transaction by fetching it from Solana RPC and validating:
  - transfer recipient == canonical artist recipient
  - amount == canonical lamports
  - Memo contains the `tip_intent_id` (canonical linkage)
- **Intent model**: intents are required; the intent identifier must appear in the transaction Memo.
- **Wallet UX**: Solana Wallet Adapter (Phantom/Solflare/etc).
- **Attribution target**: **default artist per node** via `nodes.default_artist_id` (future: multiple artists via artworks or join table).
- **Finality policy**: do not treat “seen once” as final; store receipt status and reconcile asynchronously.

### How it works (end-to-end flow)
1. Web calls `POST /v1/tips/intents` with `{ node_id, amount_lamports }`.
2. API returns `{ tip_intent_id, to_pubkey, amount_lamports, cluster=devnet, memo_text }`.
3. Web builds and sends a Solana transaction:
   - one **system program transfer** of `amount_lamports` to `to_pubkey`
   - one **Memo** instruction containing `memo_text` (must include `tip_intent_id`)
4. Web calls `POST /v1/tips/confirm` with `{ tip_intent_id, tx_signature }`.
5. API fetches the transaction from Solana RPC and verifies:
   - signature exists + parses cleanly
   - Memo contains `tip_intent_id` (and matches the provided intent id)
   - at least one SOL transfer instruction pays `to_pubkey` exactly `amount_lamports`
   - capture and store `from_pubkey` (fee payer / signer used for the transfer)
6. API stores a receipt with status `seen`/`confirmed`/`finalized`/`failed` and returns current status.
7. A background reconciler job periodically upgrades `seen/confirmed → finalized` or marks `failed` if dropped/invalid.

### Repo changes (what must land in this repo)

**Domain model (artists)**
- Add `artists` table:
  - `id`
  - `display_name`
  - `solana_recipient_pubkey` (base58 string; validated format)
  - optional: `created_at`, `updated_at`, `verified/claimed` (future)
- Link default artist per node:
  - `nodes.default_artist_id` → `artists.id`

**Tip intents + receipts**
- Add `tip_intents`:
  - `id` (this is `tip_intent_id`)
  - `node_id`
  - `artist_id` (derived from `nodes.default_artist_id` at creation time)
  - `amount_lamports`
  - `to_pubkey` (snapshotted from artist at intent creation time)
  - `created_by_user_id`
  - `expires_at`
  - `status` (`open`/`expired`/`completed`/`canceled`)
- Add `tip_receipts`:
  - `id`
  - `tip_intent_id` (unique; or allow multiple attempts with a separate constraint—pick one)
  - `tx_signature` (unique)
  - `from_pubkey`
  - `to_pubkey`
  - `amount_lamports`
  - `slot` (nullable until known)
  - `block_time` (nullable)
  - `confirmation_status` (`seen`/`confirmed`/`finalized`/`failed`)
  - `first_seen_at`, `last_checked_at`
  - `failure_reason` (nullable)

**API endpoints (illustrative)**
- `POST /v1/tips/intents`
  - Validates node exists and has `default_artist_id` and that artist has a recipient pubkey.
  - Returns canonical payment payload (recipient, lamports, memo text).
- `POST /v1/tips/confirm`
  - Accepts `{ tip_intent_id, tx_signature }`.
  - Performs authoritative RPC verification and stores/updates receipt.
  - Idempotent: repeated calls return the existing receipt/status.
- `GET /v1/nodes/{node_id}/tips`
  - Returns totals + recent receipts (backed by stored receipts; no chain scanning in hackathon scope).

**Verification rules (must be explicit)**
- Never trust client-submitted `to_pubkey`, `amount`, or `from_pubkey`.
- The memo must include the `tip_intent_id` (and the server must find it in the fetched transaction).
- Reject/mark failed if:
  - intent is expired, or
  - transaction doesn’t pay the canonical recipient the canonical lamports, or
  - signature can’t be fetched/parsed after retries.
- Do not “credit twice”:
  - `tx_signature` unique in DB
  - `tip_intent_id` should not be completable multiple times unless explicitly allowed.

**Async reconciliation**
- Add a periodic job (or worker loop) that:
  - re-fetches receipts that are `seen`/`confirmed` and upgrades to `finalized` when available
  - marks `failed` if the tx never lands within a cutoff window
  - persists `last_checked_at` + `slot`/`block_time` when known

### External setup (minimal)
- Solana cluster: **devnet**.
- RPC:
  - simplest: public RPC (acceptable for demos),
  - or one provider key (recommended for reliability) configured via server env var(s).
- Funding:
  - fund demo wallets with **devnet SOL** (simple faucet story).
- No contract deployment, no custom Solana program deployment.

### Non-goals for hackathon scope (explicitly deferred)
- USDC/SPL token tips.
- Any custom on-chain receipt program / PDAs.
- Wallet ↔ user account linking/claim flows (beyond recording `from_pubkey` on receipts).
- Chain scanning/indexing beyond stored receipts.

### Forward-compatible extension (after hackathon)
- Support multiple artists per node by introducing either:
  - `artworks` + `artworks.artist_id` and linking captures to artworks, or
  - a join table `node_artists` plus a “primary/default” flag; keep `nodes.default_artist_id` as the default tip target.

### Deferred upgrades (intentionally out of hackathon scope)
This section records future directions that are compatible with the canonical hackathon plan above but are not required to ship a working demo.

**Add USDC/SPL tips**
- Pros: stable-value tipping, broader user preference.
- Cons: ATA creation edge cases, decimals/UI complexity, more verification rules, needs mint/network decisions.

**Custom on-chain receipt program**
- Pros: canonical receipt state on-chain; natural place for fees/splits/gating later.
- Cons: program design/deployment overhead; slows hackathon velocity; more moving parts to debug.

**Chain indexing**
- Pros: can show historical tips even if the API missed confirms; enables richer analytics.
- Cons: expensive/complex for a hackathon; introduces consistency and backfill problems.
