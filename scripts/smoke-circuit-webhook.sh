#!/usr/bin/env bash
# Smoke test the Circuit → cccircuit webhook end-to-end with a signed
# request. Confirms the receiver is live and the shared secret matches.
#
# Usage:
#   CIRCUIT_WEBHOOK_SECRET="<secret>" ./scripts/smoke-circuit-webhook.sh
#
# Expected output: HTTP 200 with one of:
#   - action: "skipped_unmapped_event" (no outing maps to the test event_id)
#     → the happy path for this smoke; secret matches, receiver works
#   - action: "attendance_recorded" (if you seeded an outing with
#     circuit_event_id = "smoke-test-event")
#
# 401 means the CIRCUIT_WEBHOOK_SECRET doesn't match what's in Vercel.

set -euo pipefail

: "${CIRCUIT_WEBHOOK_SECRET:?Export CIRCUIT_WEBHOOK_SECRET before running}"

URL="${URL:-https://www.cccircuit.com/api/webhooks/circuit-checkin}"
TS=$(date +%s)
ID_KEY="smoke-$(date +%s)-$RANDOM"

BODY=$(cat <<JSON
{"type":"attendance.created","orgId":"smoke-org","locationId":"smoke-location","eventId":"smoke-test-event","guest":{"guestId":"smoke-guest","email":"smoke-test@cccircuit.test","totalVisits":1,"currentStreak":1},"attendedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","source":"tap","idempotencyKey":"$ID_KEY"}
JSON
)

SIG="t=$TS,v1=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$CIRCUIT_WEBHOOK_SECRET" -hex | awk '{print $2}')"

echo "→ POST $URL"
echo "→ timestamp: $TS"
echo "→ idempotencyKey: $ID_KEY"
echo

RESPONSE=$(curl -sS -w "\nHTTP %{http_code}\n" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Circuit-Signature: $SIG" \
  -H "X-Circuit-Event-Id: $ID_KEY" \
  -H "X-Circuit-Event-Type: attendance.created" \
  -d "$BODY")

echo "$RESPONSE"
echo

if echo "$RESPONSE" | grep -q "HTTP 200"; then
  echo "✓ webhook receiver is alive and the shared secret matches."
elif echo "$RESPONSE" | grep -q "HTTP 401"; then
  echo "✗ 401 Unauthorized — secret mismatch between CIRCUIT_WEBHOOK_SECRET"
  echo "  in your shell env and what's stored in the cccircuit Vercel project."
  exit 1
else
  echo "✗ unexpected response. Check cccircuit logs."
  exit 1
fi
