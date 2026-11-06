#!/usr/bin/env bash
# Smoke HML go-live — health, /meta, /public/home (+ login seed opcional).
# Default: loopback. HTTPS público: HML_BASE_URL=https://api-hml.…
# Não faz deploy; não exige Manus/Gemini.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${HML_BASE_URL:-http://127.0.0.1:3001}"
EMAIL="${HML_SMOKE_EMAIL:-ana.demo@example.test}"
PASSWORD="${HML_SMOKE_PASSWORD:-admin}"
SKIP_AUTH="${HML_SMOKE_SKIP_AUTH:-0}"
EXPECT_CONTRACT="${HML_EXPECT_CONTRACT:-0.7.1-vivi}"
TMP_DIR="${TMPDIR:-/tmp}/idbrf-smoke-hml-$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> Smoke HML contra $BASE_URL"

curl -sf "$BASE_URL/health" | tee "$TMP_DIR/health.json"
echo
node -e '
const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
if(j.status!=="ok") { console.error("health.status != ok", j); process.exit(1); }
' <"$TMP_DIR/health.json"
echo "health OK"

curl -sf "$BASE_URL/meta" | tee "$TMP_DIR/meta.json"
echo
HML_EXPECT_CONTRACT="$EXPECT_CONTRACT" node -e '
const expect=process.env.HML_EXPECT_CONTRACT || "0.7.1-vivi";
const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
const v=j.contractVersion || j.apiContractVersion || "";
if(v && v!==expect) {
  console.error("contractVersion mismatch:", v, "expected", expect);
  process.exit(1);
}
if(v) console.log("meta contractVersion:", v);
else console.log("meta OK (sem contractVersion no payload — aceito)");
if(j.hmlPublicUrl) console.log("hmlPublicUrl:", j.hmlPublicUrl);
else console.log("hmlPublicUrl: (null/TBD — ok antes do TLS)");
' <"$TMP_DIR/meta.json"
echo "meta OK"

curl -sf "$BASE_URL/public/home" | tee "$TMP_DIR/public-home.json" >/dev/null
node -e '
const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
if(j==null || typeof j!=="object") { console.error("public/home inválido"); process.exit(1); }
console.log("public/home keys:", Object.keys(j).slice(0,8).join(", "));
' <"$TMP_DIR/public-home.json"
echo "public/home OK"

if [[ "$SKIP_AUTH" != "1" ]]; then
  set +e
  LOGIN=$(curl -sf -X POST "$BASE_URL/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>"$TMP_DIR/login.err")
  LOGIN_RC=$?
  set -e
  if [[ $LOGIN_RC -ne 0 || -z "${LOGIN:-}" ]]; then
    echo "WARN: auth/login falhou (seed ausente?). Pule com HML_SMOKE_SKIP_AUTH=1"
    echo "      stderr: $(cat "$TMP_DIR/login.err" 2>/dev/null || true)"
  else
    echo "$LOGIN" | tee "$TMP_DIR/login.json" >/dev/null
    TOKEN=$(node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!j.accessToken) process.exit(1); process.stdout.write(j.accessToken)' <<<"$LOGIN")
    curl -sf "$BASE_URL/auth/me" -H "Authorization: Bearer $TOKEN" | tee "$TMP_DIR/me.json" >/dev/null
    echo "auth/login + auth/me OK"
  fi
fi

if [[ -x "$ROOT/scripts/hml/smoke-hml.sh" ]]; then
  echo "(legado disponível: scripts/hml/smoke-hml.sh)"
fi

echo "Smoke HML OK"
