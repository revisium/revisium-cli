#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_FILE="${MIGRATIONS_FILE:-/app/migrations.json}"
DATA_DIR="${DATA_DIR:-/app/data}"
DRY_RUN="${DRY_RUN:-false}"

log() { printf '%s\n' "$*"; }
run() {
  if [ "${DRY_RUN}" = "true" ]; then
    log "[DRY_RUN] $*"
  else
    eval "$@"
  fi
}

require_envs() {
  : "${REVISIUM_API_URL:?REVISIUM_API_URL is required}"
  : "${REVISIUM_USERNAME:?REVISIUM_USERNAME is required}"
  : "${REVISIUM_PASSWORD:?REVISIUM_PASSWORD is required}"
  : "${REVISIUM_ORGANIZATION:?REVISIUM_ORGANIZATION is required}"
  : "${REVISIUM_PROJECT:?REVISIUM_PROJECT is required}"
  : "${REVISIUM_BRANCH:?REVISIUM_BRANCH is required}"
}

log "==> Revisium CLI: $(revisium --version || true)"
log "==> Using migrations file: ${MIGRATIONS_FILE}"
log "==> Using data dir:        ${DATA_DIR}"
[ "${DRY_RUN}" = "true" ] && log "==> DRY_RUN enabled"

if [[ -f "$MIGRATIONS_FILE" ]]; then
  require_envs
  log "==> Apply migrations"
  run "revisium migrate apply --file '${MIGRATIONS_FILE}'"
else
  log "==> No migrations file found, skip migrations"
fi

if [[ -d "$DATA_DIR" ]] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null || true)" ]; then
  require_envs
  log "==> Upload rows from ${DATA_DIR}"
  run "revisium rows upload --folder '${DATA_DIR}'"
else
  log "==> Data dir empty or missing, skip rows upload"
fi

log "==> Done."
