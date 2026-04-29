#!/usr/bin/env bash

set -e

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/extract-latency.sh <jti>"
  echo "Example: bash scripts/extract-latency.sh 907436e2-a2d8-4673-8df7-f3408d66733d"
  exit 1
fi

JTI="$1"

AUTH_LOG=$(mktemp)
SERVICE_A_LOG=$(mktemp)
SERVICE_B_LOG=$(mktemp)

cleanup() {
  rm -f "$AUTH_LOG" "$SERVICE_A_LOG" "$SERVICE_B_LOG"
}
trap cleanup EXIT

docker compose logs auth-service > "$AUTH_LOG"
docker compose logs service-a > "$SERVICE_A_LOG"
docker compose logs service-b > "$SERVICE_B_LOG"

echo "========================================"
echo "Searching logs for jti: $JTI"
echo "========================================"
echo

LOGOUT_LINE=$(grep -E "\"event\":\"(token_revoked|admin_revoke)\".*\"jti\":\"$JTI\"" "$AUTH_LOG" | tail -n 1 || true)
REJECT_A_LINE=$(grep "\"event\":\"protected_request\".*\"jti\":\"$JTI\".*\"result\":\"rejected\"" "$SERVICE_A_LOG" | head -n 1 || true)
REJECT_B_LINE=$(grep "\"event\":\"protected_request\".*\"jti\":\"$JTI\".*\"result\":\"rejected\"" "$SERVICE_B_LOG" | head -n 1 || true)

echo "Logout event:"
if [ -n "$LOGOUT_LINE" ]; then
  echo "$LOGOUT_LINE"
else
  echo "Not found"
fi
echo

echo "First reject in service-a:"
if [ -n "$REJECT_A_LINE" ]; then
  echo "$REJECT_A_LINE"
else
  echo "Not found"
fi
echo

echo "First reject in service-b:"
if [ -n "$REJECT_B_LINE" ]; then
  echo "$REJECT_B_LINE"
else
  echo "Not found"
fi
echo

extract_timestamp() {
  printf '%s\n' "$1" | sed -n 's/.*"timestamp":"\([^"]*\)".*/\1/p'
}

LOGOUT_TS=$(extract_timestamp "$LOGOUT_LINE")
REJECT_A_TS=$(extract_timestamp "$REJECT_A_LINE")
REJECT_B_TS=$(extract_timestamp "$REJECT_B_LINE")

echo "========================================"
echo "Extracted timestamps"
echo "========================================"
echo "logout timestamp:         ${LOGOUT_TS:-not found}"
echo "service-a reject ts:      ${REJECT_A_TS:-not found}"
echo "service-b reject ts:      ${REJECT_B_TS:-not found}"
echo

if [ -n "$LOGOUT_TS" ] && [ -n "$REJECT_A_TS" ]; then
  LAT_A=$(python3 - <<PY
from datetime import datetime
logout = datetime.fromisoformat("${LOGOUT_TS}".replace("Z","+00:00"))
reject = datetime.fromisoformat("${REJECT_A_TS}".replace("Z","+00:00"))
print(int((reject - logout).total_seconds() * 1000))
PY
)
  echo "revocation latency service-a (ms): $LAT_A"
else
  echo "revocation latency service-a (ms): could not compute"
fi

if [ -n "$LOGOUT_TS" ] && [ -n "$REJECT_B_TS" ]; then
  LAT_B=$(python3 - <<PY
from datetime import datetime
logout = datetime.fromisoformat("${LOGOUT_TS}".replace("Z","+00:00"))
reject = datetime.fromisoformat("${REJECT_B_TS}".replace("Z","+00:00"))
print(int((reject - logout).total_seconds() * 1000))
PY
)
  echo "revocation latency service-b (ms): $LAT_B"
else
  echo "revocation latency service-b (ms): could not compute"
fi