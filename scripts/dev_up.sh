#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$REPO_ROOT/scripts/solana_devnet_bootstrap.sh"

cd "$REPO_ROOT"
docker compose up --build "$@"
