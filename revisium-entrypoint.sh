#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_FILE="${MIGRATIONS_FILE:-/app/migrations/migrations.json}"
DATA_DIR="${DATA_DIR:-/app/data}"

echo "==> Revisium CLI: $(revisium --version || true)"
echo "==> Using migrations file: ${MIGRATIONS_FILE}"
echo "==> Using data dir:        ${DATA_DIR}"

: "${REVISIUM_API_URL:?REVISIUM_API_URL is required}"
: "${REVISIUM_USERNAME:?REVISIUM_USERNAME is required}"
: "${REVISIUM_PASSWORD:?REVISIUM_PASSWORD is required}"
: "${REVISIUM_ORGANIZATION:?REVISIUM_ORGANIZATION is required}"
: "${REVISIUM_PROJECT:?REVISIUM_PROJECT is required}"
: "${REVISIUM_BRANCH:?REVISIUM_BRANCH is required}"

if [[ -f "$MIGRATIONS_FILE" ]]; then
  echo "==> Apply migrations"
  revisium migrate apply --file "${MIGRATIONS_FILE}"
else
  echo "==> No migrations file found, skip migrations"
fi

if [[ -d "$DATA_DIR" ]] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null || true)" ]; then
  echo "==> Upload rows from ${DATA_DIR}"
  revisium rows upload --folder "${DATA_DIR}"
else
  echo "==> Data dir empty or missing, skip rows upload"
fi

echo "==> Done."
