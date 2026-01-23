#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_FILE="$REPO_ROOT/data/seed/artists.json"

KEYPAIR_PATH="${SOLANA_KEYPAIR_PATH:-$HOME/.config/solana/devnet.json}"
CLUSTER_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
AIRDROP_AMOUNT="2"

PUBKEY=""
ARTIST_ID=""
ALL_ARTISTS="false"
DO_AIRDROP="true"
SEED_DB="false"

usage() {
  cat <<'USAGE'
Usage: scripts/solana_devnet_bootstrap.sh [options]

Options:
  --pubkey <PUBKEY>        Use an existing devnet pubkey (skip keypair creation).
  --keypair <PATH>         Keypair path to create/use (default: ~/.config/solana/devnet.json).
  --artist-id <UUID>       Artist id to update in data/seed/artists.json.
  --all                    Update all artists in data/seed/artists.json.
  --no-airdrop             Skip devnet airdrop.
  --airdrop <SOL>           Airdrop amount in SOL (default: 2).
  --seed-db                Run apps/api/scripts/seed_artists.py after updating seed data.
  --help                   Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pubkey)
      PUBKEY="${2:-}"
      shift 2
      ;;
    --keypair)
      KEYPAIR_PATH="${2:-}"
      shift 2
      ;;
    --artist-id)
      ARTIST_ID="${2:-}"
      shift 2
      ;;
    --all)
      ALL_ARTISTS="true"
      shift
      ;;
    --no-airdrop)
      DO_AIRDROP="false"
      shift
      ;;
    --airdrop)
      AIRDROP_AMOUNT="${2:-}"
      shift 2
      ;;
    --seed-db)
      SEED_DB="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$SEED_FILE" ]]; then
  echo "Seed file not found: $SEED_FILE"
  exit 1
fi

if [[ -z "$PUBKEY" ]]; then
  if ! command -v solana >/dev/null 2>&1; then
    echo "Solana CLI not found. Install it or pass --pubkey."
    exit 1
  fi
  if ! command -v solana-keygen >/dev/null 2>&1; then
    echo "solana-keygen not found. Install Solana CLI or pass --pubkey."
    exit 1
  fi

  if [[ ! -f "$KEYPAIR_PATH" ]]; then
    mkdir -p "$(dirname "$KEYPAIR_PATH")"
    solana-keygen new --no-bip39-passphrase --outfile "$KEYPAIR_PATH"
  fi

  PUBKEY="$(solana address -k "$KEYPAIR_PATH")"
fi

if [[ "$DO_AIRDROP" == "true" ]]; then
  if ! command -v solana >/dev/null 2>&1; then
    echo "Solana CLI not found for airdrop. Install it or pass --no-airdrop."
    exit 1
  fi
  if ! solana airdrop "$AIRDROP_AMOUNT" "$PUBKEY" --url "$CLUSTER_URL"; then
    echo "Airdrop failed. You can use https://faucet.solana.com/ for devnet funding."
  fi
fi

if [[ -z "$ARTIST_ID" && "$ALL_ARTISTS" == "false" ]]; then
  if [[ -t 0 ]]; then
    python - <<'PY' "$SEED_FILE"
import json
import sys
from pathlib import Path

seed_file = Path(sys.argv[1])
rows = json.loads(seed_file.read_text(encoding="utf-8"))
print("Select an artist to update:")
for idx, row in enumerate(rows, 1):
    print(f"{idx}) {row['display_name']} ({row['id']})")
print("all) Update all artists")
PY
    read -r -p "Choice: " choice
    if [[ "$choice" == "all" ]]; then
      ALL_ARTISTS="true"
    else
      ARTIST_ID="$(python - <<'PY' "$SEED_FILE" "$choice"
import json
import sys
from pathlib import Path

seed_file = Path(sys.argv[1])
rows = json.loads(seed_file.read_text(encoding="utf-8"))
idx = int(sys.argv[2]) - 1
if idx < 0 or idx >= len(rows):
    raise SystemExit("Invalid selection.")
print(rows[idx]["id"])
PY
)"
    fi
  else
    echo "Provide --artist-id or --all when running non-interactively."
    exit 1
  fi
fi

python - <<'PY' "$SEED_FILE" "$PUBKEY" "$ARTIST_ID" "$ALL_ARTISTS"
import json
import sys
from pathlib import Path

seed_file = Path(sys.argv[1])
pubkey = sys.argv[2]
artist_id = sys.argv[3]
update_all = sys.argv[4].lower() == "true"

rows = json.loads(seed_file.read_text(encoding="utf-8"))
updated = 0

for row in rows:
    if update_all or row["id"] == artist_id:
        row["solana_recipient_pubkey"] = pubkey
        updated += 1

if updated == 0:
    raise SystemExit("No matching artist found to update.")

seed_file.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
print(f"Updated {updated} artist(s) in {seed_file}")
PY

if [[ "$SEED_DB" == "true" ]]; then
  (cd "$REPO_ROOT/apps/api" && python scripts/seed_artists.py)
else
  echo "Next: (cd apps/api && python scripts/seed_artists.py)"
fi

echo "Devnet pubkey: $PUBKEY"
echo "RPC: $CLUSTER_URL"
