#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_FILE="${MIGRATIONS_FILE:-/app/migrations.json}"
DATA_DIR="${DATA_DIR:-/app/data}"
DRY_RUN="${DRY_RUN:-false}"

to_bool() {
  local val="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$val" in
    true|1|yes|y) echo "true" ;;
    *)            echo "false" ;;
  esac
}

REVISIUM_MIGRATE_COMMIT="$(to_bool "${REVISIUM_MIGRATE_COMMIT:-false}")"
REVISIUM_UPLOAD_COMMIT="$(to_bool "${REVISIUM_UPLOAD_COMMIT:-false}")"

MIGRATE_COMMIT_FLAG=""
UPLOAD_COMMIT_FLAG=""

if [ "$REVISIUM_MIGRATE_COMMIT" = "true" ]; then
  MIGRATE_COMMIT_FLAG="--commit"
fi

if [ "$REVISIUM_UPLOAD_COMMIT" = "true" ]; then
  UPLOAD_COMMIT_FLAG="--commit"
fi

log() { printf '%s\n' "$*"; }
run() {
  if [ "${DRY_RUN}" = "true" ]; then
    log "[DRY_RUN] $*"
  else
    eval "$@"
  fi
}

require_envs() {
  : "${REVISIUM_URL:?REVISIUM_URL is required (format: revisium://[user:pass@]host/org/project/branch:draft[?token=...]). See https://github.com/revisium/revisium-cli/blob/master/docs/url-format.md}"
}

log "==> Revisium CLI: $(revisium --version || true)"
log "==> Using migrations file: ${MIGRATIONS_FILE}"
log "==> Using data dir:        ${DATA_DIR}"
[ "${DRY_RUN}" = "true" ] && log "==> DRY_RUN enabled"

if [[ -f "$MIGRATIONS_FILE" ]]; then
  require_envs
  log "==> Apply migrations"
  run "revisium migrate apply --file '${MIGRATIONS_FILE}' --url '${REVISIUM_URL}' ${MIGRATE_COMMIT_FLAG}"
else
  log "==> No migrations file found, skip migrations"
fi

if [[ -d "$DATA_DIR" ]] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null || true)" ]; then
  require_envs
  log "==> Upload rows from ${DATA_DIR}"
  run "revisium rows upload --folder '${DATA_DIR}' --url '${REVISIUM_URL}' ${UPLOAD_COMMIT_FLAG}"
else
  log "==> Data dir empty or missing, skip rows upload"
fi

log "==> Done."
