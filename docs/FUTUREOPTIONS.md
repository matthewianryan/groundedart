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

## TODO:
On-chain tipping (Solana), targeting specific artists (hackathon scope)

### What we are choosing between (native-only vs USDC vs either)
These choices determine **what assets users can tip with** and what we must implement in the client + API verification.

1) **Native-only (SOL)**
   - **Meaning:** tips are paid in SOL via a standard system transfer.
   - **Functional translation (on-chain):**
     - Web wallet signs a transaction containing `SystemProgram.transfer(from=payer, to=artist_pubkey, lamports=...)`.
     - Optional: include a `Memo` instruction encoding `tip_intent_id` / `artist_id` / `capture_id` for auditability.
   - **Implications:**
     - Simplest UX and verification.
     - If the user has SOL, they can tip; no SPL token account complexity.

2) **USDC-only (SPL token)**
   - **Meaning:** tips are paid in USDC (an SPL token), not SOL.
   - **Functional translation (on-chain):**
     - Web wallet signs a transaction containing SPL token instructions:
       - Ensure sender USDC token account exists (it will).
       - Ensure recipient **Associated Token Account (ATA)** exists; create it if missing.
       - `transfer_checked` (or equivalent) from sender ATA → recipient ATA for the USDC mint.
     - Optional: include a `Memo` instruction encoding `tip_intent_id` / `artist_id` / `capture_id`.
   - **Implications:**
     - More implementation surface (ATA creation, mint/decimals, token program IDs).
     - **User still needs SOL** to pay transaction fees, even if tipping in USDC (unless we add a relayer/gasless flow).
     - Requires choosing a USDC mint per network (devnet vs mainnet mints differ).

3) **Either (SOL + USDC)**
   - **Meaning:** users can choose SOL or USDC at tip time.
   - **Functional translation (on-chain):**
     - Same as above, but the tip flow becomes “asset-aware”:
       - For SOL: one system transfer instruction.
       - For USDC: token transfer instructions + optional ATA creation.
   - **Implications:**
     - Best flexibility; most code paths.
     - Requires the DB + API “receipt” model to include:
       - `asset_kind` (`sol` vs `spl`)
       - `token_mint` (for SPL; USDC mint pubkey)
       - `amount` in base units (lamports for SOL; token base units for SPL)
     - UI must handle decimals and formatting:
       - SOL uses 9 decimals (lamports).
       - USDC typically uses 6 decimals.

### “Fully integrated” on Solana: receipt strategy options
Solana doesn’t have EVM-style “events” in the same way; the closest equivalents are **transaction logs**, **program-owned receipt accounts**, and **indexable references/memos**.

Option A — **No custom program (fastest): transfer + memo/reference**
- Web constructs a normal transfer (SOL or USDC) and includes a `Memo` (and/or Solana Pay-style “reference”) that ties it to an in-app `tip_intent_id`.
- API verifies the transaction by signature:
  - Fetch via RPC (`getTransaction`) and assert:
    - the expected recipient address is paid,
    - the amount matches,
    - the expected mint (for USDC) matches,
    - the memo/reference matches the `tip_intent_id`,
    - the transaction is confirmed at the chosen commitment level.
- Pros: no on-chain program deployment; minimal risk.
- Cons: tying a payment to an in-app entity is “convention” (memo/reference), not enforced by a program; needs robust verification logic.

Option B — **Custom TipReceipt program (strongest integration)**
- Deploy a Solana program that:
  - validates inputs (artist recipient, amount, optional platform fee/splits),
  - transfers funds (SOL and/or SPL),
  - creates/updates a **TipReceipt PDA account** storing `{tipper, artist, amount, mint, capture_id/node_id, created_at}`.
- API can verify by:
  - checking the receipt account state (canonical),
  - optionally indexing program logs for the demo UI.
- Pros: canonical receipt data; easier to extend to splits/fees/gating.
- Cons: program design, audits, deployment, and client integration cost.

### Repo changes (what must land in this repo)
**Domain model (to target specific artists)**
- Introduce an `artists` table and link it to captures/nodes:
  - `artists`: `id`, `display_name`, `solana_recipient_pubkey`, optional `verified/claimed` fields.
  - One of:
    - `captures.artist_id` (tip the artist tied to the capture), or
    - `nodes.default_artist_id` (tip the “owner” artist for the node), or
    - `artworks` + `artwork.artist_id` (more correct; more work).

**Tip intent + receipt persistence**
- Add `tip_intents` and `tip_receipts` (or one table if we skip intents):
  - `tip_intents`: server-issued id, `artist_id`, `capture_id`/`node_id`, `asset_kind`, `token_mint`, `amount`, `created_by_user_id`, `expires_at`.
  - `tip_receipts`: `tip_intent_id`, `tx_signature`, `from_pubkey`, `to_pubkey`, `token_mint` (nullable for SOL), `amount`, `confirmed_at`, `slot`, `status`.

**API endpoints (illustrative)**
- `POST /v1/tips/intents` → create intent and return the canonical “what to pay” payload.
- `POST /v1/tips/confirm` → submit `tx_signature`; API verifies and stores receipt.
- `GET /v1/artists/{artist_id}/tips` and/or `GET /v1/nodes/{node_id}/tips` → totals/history for UI.

**Web**
- Wallet connect (Solana Wallet Adapter: Phantom/Solflare/etc).
- Tip UI on node/capture views:
  - choose amount,
  - choose asset (SOL/USDC) if we support “either”,
  - send transaction,
  - submit signature for confirmation and show success/receipt.

### External setup (what is configured outside the repo)
- Solana network selection: `devnet` vs `mainnet-beta` (hackathons usually start on devnet).
- RPC provider (public RPC works for demos; managed RPC is more reliable):
  - examples: Helius, QuickNode, Triton, Alchemy Solana.
- If using USDC:
  - decide the USDC mint pubkey for the chosen network and ensure faucets/fixtures exist for demo wallets.
- If using a custom TipReceipt program:
  - program deployment + program ID distribution to web/API.

### Other “core functionality” considerations we must account for
- **Artist wallet claiming/admin management:** how an artist sets/changes `solana_recipient_pubkey` (admin-only for hackathon vs self-serve claim flow).
- **Verification + finality policy:** what commitment we accept (`confirmed` vs `finalized`) and how we handle dropped/expired transactions.
- **Idempotency:** prevent the same `tx_signature` from being credited twice; prevent “intent reuse” if we model intents.
- **Fraud checks:** verify the transfer actually pays the intended recipient/mint/amount; do not trust client-submitted fields.
- **Fees:** users always need SOL for fees unless we add a relayer (out of scope unless explicitly chosen).
- **Indexing strategy:** for receipts/history, decide if we rely on stored receipts only (simplest) vs chain scan by reference (more complex).
