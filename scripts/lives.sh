#!/usr/bin/env bash
# Run this on your laptop, where the sprite CLI is logged in.
# Checkpoints are taken from outside the Sprite. A restore restarts it,
# so the "you rewound me" mark is written after the grown restore returns.
set -euo pipefail

SPRITE="${SPRITE:-gos}"
APP_DIR="${APP_DIR:-/home/sprite/gos}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${CHECKPOINT_FILE:-$ROOT/.gos-checkpoints}"

if ! command -v sprite >/dev/null 2>&1; then
  echo "lives.sh runs on your laptop. Install the sprite CLI first." >&2
  exit 1
fi

read_id() {
  local key="$1"
  if [[ ! -f "$FILE" ]]; then
    echo "No checkpoint file at $FILE. Run puppy or grown first, or pass an id." >&2
    exit 1
  fi
  local value
  value="$(grep -E "^${key}=" "$FILE" | tail -n 1 | cut -d= -f2-)"
  if [[ -z "$value" ]]; then
    echo "No ${key} id in $FILE." >&2
    exit 1
  fi
  printf "%s" "$value"
}

save_id() {
  local key="$1"
  local value="$2"
  touch "$FILE"
  grep -v -E "^${key}=" "$FILE" > "${FILE}.tmp" || true
  printf "%s=%s\n" "$key" "$value" >> "${FILE}.tmp"
  mv "${FILE}.tmp" "$FILE"
}

checkpoint() {
  local comment="$1"
  local out id
  out="$(sprite checkpoint create -s "$SPRITE" --comment "$comment")"
  printf "%s\n" "$out" >&2
  id="$(printf "%s\n" "$out" | grep -oE 'v[0-9]+' | tail -n 1)"
  printf "%s" "$id"
}

cmd="${1:-}"
override="${2:-}"

case "$cmd" in
  puppy)
    sprite exec -s "$SPRITE" --dir "$APP_DIR" -- node dist/mark-life.js puppy --reset
    id="$(checkpoint "gos puppy, does not know you yet")"
    if [[ -z "$id" ]]; then
      echo "Checkpoint command returned no id. Copy the id from the output above into $FILE as PUPPY=vN." >&2
      exit 1
    fi
    save_id PUPPY "$id"
    echo "Puppy checkpoint is $id"
    ;;
  grown)
    sprite exec -s "$SPRITE" --dir "$APP_DIR" -- node dist/mark-life.js grown
    id="$(checkpoint "gos grown")"
    if [[ -z "$id" ]]; then
      echo "Checkpoint command returned no id. Copy the id into $FILE as GROWN=vN." >&2
      exit 1
    fi
    save_id GROWN "$id"
    echo "Grown checkpoint is $id"
    ;;
  restore-puppy)
    id="${override:-$(read_id PUPPY)}"
    echo "Restoring $id. Anything not in that checkpoint is replaced."
    sprite restore -s "$SPRITE" "$id"
    echo "Puppy Gos is coming back. Wait for the URL, then reload."
    ;;
  restore-grown)
    id="${override:-$(read_id GROWN)}"
    echo "Restoring $id. Anything not in that checkpoint is replaced."
    sprite restore -s "$SPRITE" "$id"
    sprite exec -s "$SPRITE" --dir "$APP_DIR" -- node dist/mark-life.js wound
    echo "Grown Gos is back, and he knows you restored an older copy."
    ;;
  *)
    echo "Usage: SPRITE=gos scripts/lives.sh puppy|grown|restore-puppy|restore-grown [id]" >&2
    exit 1
    ;;
esac
