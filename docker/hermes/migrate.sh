#!/usr/bin/env bash
# migrate.sh — Migrate an OpenClaw multi-container instance to Hermes Agent
#
# Usage:
#   ./migrate.sh <instance-number>          # e.g. ./migrate.sh 1
#   ./migrate.sh <instance-number> --dry-run
#
# What it does:
#   1. Copies the OpenClaw instance data into a layout Hermes can read
#   2. Runs `hermes claw migrate` inside the container (with --dry-run if requested)
#   3. Copies API keys from the OpenClaw .env to the Hermes .env
#
# Prerequisites:
#   - docker compose build (at least once)
#   - The OpenClaw multi-container data dir at ../multi/data/instance-<N>/

set -euo pipefail

INSTANCE="${1:?Usage: ./migrate.sh <instance-number> [--dry-run]}"
DRY_RUN="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OPENCLAW_SRC="${SCRIPT_DIR}/../multi/data/instance-${INSTANCE}"
HERMES_DATA="${SCRIPT_DIR}/data"

if [ ! -d "$OPENCLAW_SRC" ]; then
  echo "Error: OpenClaw instance directory not found: $OPENCLAW_SRC"
  exit 1
fi

echo "=== Migrating OpenClaw instance-${INSTANCE} to Hermes ==="
echo "Source: $OPENCLAW_SRC"
echo "Target: $HERMES_DATA"
echo

# ── Step 1: Stage OpenClaw data so Hermes can find it at /opt/data/.openclaw ──
mkdir -p "$HERMES_DATA/.openclaw"

# Copy the OpenClaw config and workspace files
echo "Staging OpenClaw data..."
cp -f "$OPENCLAW_SRC/openclaw.json" "$HERMES_DATA/.openclaw/" 2>/dev/null || true

if [ -f "$OPENCLAW_SRC/.env" ]; then
  cp -f "$OPENCLAW_SRC/.env" "$HERMES_DATA/.openclaw/"
fi

if [ -d "$OPENCLAW_SRC/workspace" ]; then
  cp -rf "$OPENCLAW_SRC/workspace" "$HERMES_DATA/.openclaw/"
fi

echo "Staged files:"
ls -la "$HERMES_DATA/.openclaw/"
echo

# ── Step 2: Run hermes claw migrate inside the container ──
MIGRATE_ARGS="--source /opt/data/.openclaw --yes"
if [ "$DRY_RUN" = "--dry-run" ]; then
  MIGRATE_ARGS="$MIGRATE_ARGS --dry-run"
  echo "Running migration in dry-run mode..."
else
  echo "Running migration..."
fi

docker compose run --rm \
  -e HOME=/opt/data \
  hermes claw migrate $MIGRATE_ARGS

echo

# ── Step 3: Copy API keys from OpenClaw .env to Hermes .env ──
if [ "$DRY_RUN" != "--dry-run" ] && [ -f "$OPENCLAW_SRC/.env" ]; then
  echo "Copying API keys to Hermes .env..."
  HERMES_ENV="$HERMES_DATA/.env"
  touch "$HERMES_ENV"

  # Keys to migrate (skip OPENROUTER_MODEL — Hermes uses config.yaml for model)
  for KEY in OPENROUTER_API_KEY TELEGRAM_BOT_TOKEN GOOGLE_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION; do
    VALUE=$(grep "^${KEY}=" "$OPENCLAW_SRC/.env" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -n "$VALUE" ]; then
      # Update or append
      if grep -q "^${KEY}=" "$HERMES_ENV" 2>/dev/null; then
        sed -i.bak "s|^${KEY}=.*|${KEY}=${VALUE}|" "$HERMES_ENV"
      else
        echo "${KEY}=${VALUE}" >> "$HERMES_ENV"
      fi
      echo "  ✓ ${KEY}"
    fi
  done
  rm -f "$HERMES_ENV.bak"
  chmod 600 "$HERMES_ENV"
  echo
fi

# ── Step 4: Clean up staged data ──
if [ "$DRY_RUN" != "--dry-run" ]; then
  rm -rf "$HERMES_DATA/.openclaw"
  echo "Cleaned up staged OpenClaw data."
fi

echo
echo "=== Migration complete ==="
if [ "$DRY_RUN" != "--dry-run" ]; then
  echo "Next steps:"
  echo "  1. Review data/.env and data/config.yaml"
  echo "  2. docker compose run --rm hermes setup   # finish configuration"
  echo "  3. docker compose up -d                   # start the gateway"
  echo
  echo "NOTE: If this instance used a Telegram bot token, you must STOP the"
  echo "OpenClaw instance first — a bot token can only connect to one agent."
fi
