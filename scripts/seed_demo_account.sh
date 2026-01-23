#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "${REPO_ROOT}/.venv311/bin/activate"
python "${REPO_ROOT}/apps/api/scripts/seed_demo_account.py"
