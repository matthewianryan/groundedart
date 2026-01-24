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

Option A — Phantom or Solflare (browser wallet)

Install the wallet:
Phantom: install the browser extension from https://phantom.app
Solflare: install from https://solflare.com
Open the wallet extension and create a new wallet.
Set the wallet network to Devnet.
Phantom: Settings → Developer Settings → “Show Test Networks” → turn on → select Devnet.
Solflare: Network dropdown → Devnet.
Copy your wallet’s public address (pubkey). You’ll use this as the tip recipient.
Fund the wallet with devnet SOL:
Go to https://faucet.solana.com (Devnet), paste your pubkey, request an airdrop.
Wait for the airdrop to complete in the wallet.

Integrate the devnet wallet into the repo

Enable tips in web env

Open .env (or create it from .env.example) and set:
VITE_TIPS_ENABLED=true
api.devnet.solana.com
api.devnet.solana.com
These must both stay on devnet or receipt verification fails. See .env.example.
Set the artist recipient pubkey
Edit artists.json and replace the placeholder solana_recipient_pubkey value(s) with your devnet wallet pubkey.
Reseed artists
Run from repo root:
cd apps/api
python scripts/seed_artists.py
This updates the DB so the node’s default artist points at your devnet pubkey.

Start the stack

From repo root:
docker compose -f infra/docker-compose.yml up -d --build
Open the app and test the flow
Web UI: http://localhost:5173/
Go to a node detail page and confirm “Tip the artist” shows (if not, check VITE_TIPS_ENABLED).
Connect wallet and send tip
Click Connect wallet in the Tip UI (uses your devnet wallet).
Select a tip amount, send, then confirm.
The API verifies the on‑chain tx and stores the receipt.
(Optional) Run receipt reconciler
If you want finalization updates:
cd apps/api
python scripts/reconcile_tip_receipts.py --loop
