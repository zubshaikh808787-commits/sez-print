#!/usr/bin/env bash
# Run GATE-A Tasks 4.4 + 4.6 on a connected Android dev build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

METRO_PORT=8081
METRO_URL="http://127.0.0.1:${METRO_PORT}"
DEV_CLIENT_URL="exp+sez-print://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${METRO_PORT}"
GATE_ROUTE_URL="sezprint://stage-a-gates"

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
  npx expo start --port "${METRO_PORT}" >/tmp/sez-print-metro-gate-a.log 2>&1 &
  local metro_pid=$!
  local waited=0
  while ! metro_running; do
    sleep 2
    waited=$((waited + 2))
    if [ "$waited" -ge 90 ]; then
      kill "$metro_pid" 2>/dev/null || true
      die "Metro did not become ready within 90s (see /tmp/sez-print-metro-gate-a.log)"
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

# Note: awk END runs even after an early `exit 0` from a rule, so never put
# `exit 1` in END — it would override a successful match on the device line.
if ! adb devices | awk 'NR>1 && $2=="device" { found=1 } END { exit(found ? 0 : 1) }'; then
  die "No Android device attached. Plug in the phone (USB debugging on) and retry."
fi

ensure_metro

log "Setting up adb reverse for Metro…"
adb reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" || true

log "Launching dev client…"
adb shell am force-stop com.sezprint.app
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d "${DEV_CLIENT_URL}" com.sezprint.app

log "Waiting for JS bundle (poll logcat for Running \"main\", up to 120s)…"
wait_for_logcat 'Running "main"' 120 'Hermes bundle loaded'

log "Waiting for Expo Router to settle (8s)…"
sleep 8
adb shell am start -n com.sezprint.app/.MainActivity >/dev/null 2>&1 || true
sleep 2

log "Navigating to ${GATE_ROUTE_URL}…"
adb shell am start -a android.intent.action.VIEW -d "${GATE_ROUTE_URL}" com.sezprint.app >/dev/null 2>&1 || true
sleep 2
adb shell am start -a android.intent.action.VIEW -d "sezprint:///stage-a-gates" com.sezprint.app >/dev/null 2>&1 || true

log "Waiting for stage-a-gates mount (up to 60s)…"
wait_for_logcat 'stage-a-gates mounted' 60 'GATE-A screen mounted'

log "Waiting for benchmark completion (poll for report written, up to 180s)…"
wait_for_logcat 'report written to' 180 'GATE-A benchmark finished'

echo ""
echo "=== GATE-A logcat (summary + task44) ==="
adb logcat -d | rg "\[GATE-A\]" | rg -v "task46 run=" || true

echo ""
echo "=== GATE-A report file ==="
adb shell run-as com.sezprint.app cat files/gate-a-report.txt 2>/dev/null \
  || die "gate-a-report.txt not found on device"
