#!/bin/sh
set -eu

cd /app/apps/web

if [ -z "${VITE_GOOGLE_MAPS_API_KEY:-}" ]; then
  echo "[web] WARNING: VITE_GOOGLE_MAPS_API_KEY is not set; the map will not load."
fi

LOCK_HASH="$(
  node -e 'const fs=require("fs");const crypto=require("crypto");const b=fs.readFileSync("package-lock.json");process.stdout.write(crypto.createHash("sha256").update(b).digest("hex"));'
)"
STAMP_FILE="node_modules/.ga_package_lock_sha256"

if [ ! -d node_modules ] || [ ! -f "$STAMP_FILE" ] || [ "$(cat "$STAMP_FILE")" != "$LOCK_HASH" ]; then
  echo "[web] Installing dependencies…"
  if npm ci 2>/dev/null; then
    echo "[web] Dependencies installed with npm ci"
  else
    echo "[web] npm ci failed, falling back to npm install…"
    npm install
  fi
  mkdir -p node_modules
  echo "$LOCK_HASH" > "$STAMP_FILE"
fi

exec "$@"
