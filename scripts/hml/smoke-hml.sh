#!/usr/bin/env bash
# Smoke HML — loopback por padrão; HTTPS só se HML_BASE_URL estiver setado.
set -euo pipefail

BASE_URL="${HML_BASE_URL:-http://127.0.0.1:3001}"
EMAIL="${HML_SMOKE_EMAIL:-ana.demo@example.test}"
PASSWORD="${HML_SMOKE_PASSWORD:-admin}"

echo "Smoke contra $BASE_URL"

curl -sf "$BASE_URL/health" | tee /tmp/idbrf-hml-health.json
echo
curl -sf "$BASE_URL/meta" | tee /tmp/idbrf-hml-meta.json
echo

LOGIN=$(curl -sf -X POST "$BASE_URL/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
echo "$LOGIN" | tee /tmp/idbrf-hml-login.json
TOKEN=$(node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!j.accessToken) process.exit(1); process.stdout.write(j.accessToken)' <<<"$LOGIN")

curl -sf "$BASE_URL/auth/me" -H "Authorization: Bearer $TOKEN" | tee /tmp/idbrf-hml-me.json
echo
curl -sf "$BASE_URL/public/home" | tee /tmp/idbrf-hml-public-home.json >/dev/null
echo "public/home OK"

echo "Smoke HML OK"
