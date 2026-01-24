# Solana tips (devnet-only) — contract + setup

Grounded Art’s tipping flow is **Solana devnet only** in this repo.

## Contract (read this first)

- The `solana_recipient_pubkey` values seeded from `data/seed/artists.json` are **demo placeholders**.
  - They are **just public addresses** stored in the DB.
  - They **do not** prove ownership and **do not** give anyone control of funds.
- Sending a tip requires a **real devnet wallet you control** (Phantom/Solflare or a `solana-keygen` wallet) because the on-chain transfer + memo must be **signed** by that wallet.
- A tip intent is **not a payment** by itself: it’s only a server-issued “payment plan” (recipient + amount + memo text). The actual on-chain transfer must happen, then the API verifies it.

## Required env (devnet)

- API receipt verification RPC: `SOLANA_RPC_URL=https://api.devnet.solana.com`
- Web wallet adapter RPC: `VITE_SOLANA_RPC_URL=https://api.devnet.solana.com`
- Tip UI toggle: `VITE_TIPS_ENABLED=true`

If your web app is pointed at mainnet (or any non-devnet cluster), the API will not be able to verify your tip receipts.

## Setup checklist (devnet wallet + funding)

### One-command bootstrap + compose (recommended)
Runs a local devnet wallet/bootstrap first, then starts Docker:

```bash
./scripts/dev_up.sh
```

### Option A — Phantom / Solflare (recommended for the demo)
1. Install Phantom or Solflare.
2. Switch the wallet network to **Devnet**.
3. Create/select an account and copy its **public address**.
4. Fund the wallet with devnet SOL:
   - https://faucet.solana.com/ (Devnet), or
   - `solana airdrop 2 <PUBKEY> --url devnet`

### Option B — CLI wallet (`solana-keygen`)
1. Install the Solana CLI.
2. Create a keypair and extract the pubkey:
   - `solana-keygen new --outfile ~/.config/solana/devnet.json`
   - `solana-keygen pubkey ~/.config/solana/devnet.json`
3. Fund it on devnet:
   - `solana airdrop 2 <PUBKEY> --url devnet`

## Demo recipient pubkeys (devnet/test only)

To make a node tip to your wallet:
1. Replace the placeholder `solana_recipient_pubkey` in `data/seed/artists.json` with your **devnet wallet pubkey**.
2. Reseed artists:
   - `cd apps/api && python scripts/seed_artists.py`

## End-to-end flow (what must happen)

1. Web calls `POST /v1/tips/intents` → API returns canonical `{ tip_intent_id, to_pubkey, amount_lamports, cluster: "devnet", memo_text }`.
2. Web builds a transaction containing:
   - a **SystemProgram transfer** paying `to_pubkey` exactly `amount_lamports`, and
   - a **Memo** instruction containing the exact `memo_text`.
3. A connected wallet **signs and sends** that transaction (devnet RPC).
4. Web calls `POST /v1/tips/confirm` with `{ tip_intent_id, tx_signature }`.
5. API verifies the on-chain transaction via devnet RPC and stores a receipt.

---

## Step-by-step: devnet wallet setup + funding

### Option A — Phantom or Solflare (browser wallet)
1. Install the wallet:
   - Phantom: https://phantom.app
   - Solflare: https://solflare.com
2. Open the extension and create a new wallet.
3. Switch the wallet network to **Devnet**.
   - Phantom: Settings → Developer Settings → enable “Show Test Networks” → select Devnet.
   - Solflare: Network dropdown → Devnet.
4. Copy your wallet **public address (pubkey)**.
5. Fund the wallet with devnet SOL:
   - https://faucet.solana.com (Devnet) → paste pubkey → request airdrop.
   - Wait for the airdrop to land in the wallet.

### Option B — CLI wallet (`solana-keygen`)
1. Install the Solana CLI.
2. Create a devnet keypair:
   - `solana-keygen new --outfile ~/.config/solana/devnet.json`
3. Get the pubkey:
   - `solana-keygen pubkey ~/.config/solana/devnet.json`
4. Fund it on devnet:
   - `solana airdrop 2 <PUBKEY> --url devnet`
5. Confirm balance:
   - `solana balance <PUBKEY> --url devnet`

---

## Integrate the devnet wallet into the repo

### 1) Enable tips in the web env
Open `.env` (or create it from `.env.example`) and set:

```
VITE_TIPS_ENABLED=true
SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

These must both stay on devnet or receipt verification fails.

### 2) Set the artist recipient pubkey
Edit `data/seed/artists.json` and replace the placeholder `solana_recipient_pubkey` value(s)
with your devnet wallet pubkey.

### 3) Reseed artists
Run from repo root:

```bash
cd apps/api
python scripts/seed_artists.py
```

### 4) Start the stack
From repo root:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

### 5) Open the app and send a tip
1. Web UI: `http://localhost:5173/`
2. Open a node detail page and confirm **Tip the artist** appears.
3. Click **Connect wallet** and connect your devnet wallet.
4. Choose an amount, send, and confirm.
5. The API verifies the on-chain transaction and stores the receipt.

### 6) Optional: run the receipt reconciler
If you want finalization updates:

```bash
cd apps/api
python scripts/reconcile_tip_receipts.py --loop
```
