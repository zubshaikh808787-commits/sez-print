#!/usr/bin/env bash
# 1000-run forced dot-buffer confirmation on a connected Android dev build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

METRO_PORT=8081
METRO_URL="http://127.0.0.1:${METRO_PORT}"
DEV_CLIENT_URL="exp+sez-print://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${METRO_PORT}"
GATE_ROUTE_URL="sezprint://dot-buffer-1k"
OUT_DIR="${ROOT}/artifacts"
OUT_CSV="${OUT_DIR}/dot-buffer-1k.csv"

log() { echo "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

metro_running() {
  curl -sf "${METRO_URL}/status" >/dev/null 2>&1
}

ensure_metro() {
  if metro_running; then
    log "Metro is running on port ${METRO_PORT}."
    return 0
  fi
  log "Metro is not running — starting it in the background…"
  npx expo start --port "${METRO_PORT}" >/tmp/sez-print-metro-dot-1k.log 2>&1 &
  local metro_pid=$!
  local waited=0
  while ! metro_running; do
    sleep 2
    waited=$((waited + 2))
    if [ "$waited" -ge 90 ]; then
      kill "$metro_pid" 2>/dev/null || true
      die "Metro did not become ready within 90s"
    fi
  done
  log "Metro ready after ${waited}s (pid ${metro_pid})."
}

wait_for_logcat() {
  local pattern="$1"
  local timeout_s="$2"
  local label="$3"
  local start
  start=$(date +%s)
  while true; do
    if adb logcat -d 2>/dev/null | rg -q "$pattern"; then
      log "✓ ${label}"
      return 0
    fi
    if [ "$(date +%s)" -ge $((start + timeout_s)) ]; then
      die "Timed out after ${timeout_s}s waiting for: ${label}"
    fi
    sleep 2
  done
}

if ! adb devices | awk 'NR>1 && $2=="device" { found=1 } END { exit(found ? 0 : 1) }'; then
  die "No Android device attached."
fi

ensure_metro

log "Setting up adb reverse for Metro…"
adb reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" || true

log "Launching dev client…"
adb shell am force-stop com.sezprint.app
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d "${DEV_CLIENT_URL}" com.sezprint.app

log "Waiting for JS bundle…"
wait_for_logcat 'Running "main"' 120 'Hermes bundle loaded'

log "Waiting for Expo Router to settle (8s)…"
sleep 8
adb shell am start -n com.sezprint.app/.MainActivity >/dev/null 2>&1 || true
sleep 2

log "Navigating to ${GATE_ROUTE_URL}…"
adb shell am start -a android.intent.action.VIEW -d "${GATE_ROUTE_URL}" com.sezprint.app >/dev/null 2>&1 || true
sleep 2
adb shell am start -a android.intent.action.VIEW -d "sezprint:///dot-buffer-1k" com.sezprint.app >/dev/null 2>&1 || true

log "Waiting for screen mount (up to 60s)…"
wait_for_logcat '\[DOT-1K\] screen mounted' 60 'DOT-1K screen mounted'

log "Waiting for 1000-run completion (up to 300s)…"
wait_for_logcat '\[DOT-1K\] report written to' 300 'DOT-1K finished'

echo ""
echo "=== DOT-1K logcat summary ==="
adb logcat -d | rg "\[DOT-1K\]" | rg -v "progress " || true

mkdir -p "${OUT_DIR}"
log "Pulling CSV to ${OUT_CSV}…"
adb shell run-as com.sezprint.app cat files/dot-buffer-1k.csv > "${OUT_CSV}" \
  || die "dot-buffer-1k.csv not found on device"

rows=$(wc -l < "${OUT_CSV}" | tr -d ' ')
log "CSV lines (header + rows): ${rows}"
if [ "${rows}" -lt 1001 ]; then
  die "Expected 1001 lines (header + 1000 runs), got ${rows}"
fi

echo ""
echo "=== CSV path ==="
echo "${OUT_CSV}"
