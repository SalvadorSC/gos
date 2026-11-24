#!/usr/bin/env bash
# Run this inside the Sprite, from a checkout of this repo.
# It installs Gos and registers a service that comes back after a cold wake.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is missing. Sprites ship with Node. Run this script inside the Sprite." >&2
  exit 1
fi

npm ci
npm run build

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Wrote .env from .env.example. Put the real values in it, then run this script again." >&2
  exit 1
fi

if ! command -v sprite-env >/dev/null 2>&1; then
  echo "Build finished. sprite-env is not on this machine, so no service was registered." >&2
  echo "On the Sprite, run: bash scripts/sprite-setup.sh" >&2
  exit 0
fi

if sprite-env services get gos >/dev/null 2>&1; then
  sprite-env services delete gos
fi

# --http-port makes a cold request start this process. The URL hits that port.
sprite-env services create gos \
  --cmd node \
  --args "dist/index.js" \
  --dir "$PWD" \
  --http-port 8080 \
  --no-stream

echo "Gos is registered. Logs: /.sprite/logs/services/gos.log"
echo "From your laptop, after sprite use <name>: sprite config update --url-auth public"
