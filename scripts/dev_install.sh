#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$REPO_ROOT/.venv311"

if ! command -v python3.11 >/dev/null 2>&1; then
  echo "python3.11 not found. Install Python 3.11 and re-run."
  exit 1
fi

if [[ ! -d "$VENV_DIR" ]]; then
  python3.11 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip
python -m pip install -e "$REPO_ROOT/apps/api[dev]"

if command -v docker >/dev/null 2>&1; then
  docker compose -f "$REPO_ROOT/infra/docker-compose.yml" up -d db
else
  echo "docker not found; skipping database startup."
fi

(
  cd "$REPO_ROOT/apps/api"
  alembic upgrade head
)

(
  cd "$REPO_ROOT/apps/web"
  npm install
)
