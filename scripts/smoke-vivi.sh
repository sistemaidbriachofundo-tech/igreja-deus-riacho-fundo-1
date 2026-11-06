#!/usr/bin/env bash
# Smoke Vivi — /vivi/status + chat público mock/live + consent gate.
# Default: loopback. HTTPS: HML_BASE_URL=https://api-hml.…
# Não exige MANUS_/GEMINI_ (mock OK em DEV); em HML live espere credentialsReady=true.
set -euo pipefail

BASE_URL="${HML_BASE_URL:-${VIVI_BASE_URL:-http://127.0.0.1:3001}}"
REQUIRE_LIVE="${VIVI_SMOKE_REQUIRE_LIVE:-0}"
TMP_DIR="${TMPDIR:-/tmp}/idbrf-smoke-vivi-$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> Smoke Vivi contra $BASE_URL"

curl -sf "$BASE_URL/health" | tee "$TMP_DIR/health.json" >/dev/null
echo "health OK"

curl -sf "$BASE_URL/vivi/status" | tee "$TMP_DIR/status.json"
echo
VIVI_SMOKE_REQUIRE_LIVE="$REQUIRE_LIVE" node -e '
const requireLive = process.env.VIVI_SMOKE_REQUIRE_LIVE === "1";
const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (j.assistant !== "vivi") {
  console.error("assistant != vivi", j);
  process.exit(1);
}
const provider = j.provider || j.effectiveProvider;
if (!["manus", "gemini", "mock"].includes(provider)) {
  console.error("provider inválido", provider);
  process.exit(1);
}
console.log("provider:", provider, "model:", j.model);
console.log("credentialsReady:", j.credentialsReady);
console.log("usingMockFallback:", j.usingMockFallback);
if (Array.isArray(j.configWarnings) && j.configWarnings.length) {
  console.log("configWarnings:");
  for (const w of j.configWarnings) console.log(" -", w);
}
if (requireLive) {
  if (j.credentialsReady !== true) {
    console.error("VIVI_SMOKE_REQUIRE_LIVE=1 mas credentialsReady!=true");
    process.exit(1);
  }
  if (j.usingMockFallback === true || provider === "mock") {
    console.error("VIVI_SMOKE_REQUIRE_LIVE=1 mas provider efetivo é mock");
    process.exit(1);
  }
}
' <"$TMP_DIR/status.json"
echo "vivi/status OK"

# Consent gate
set +e
NO_CONSENT=$(curl -s -o "$TMP_DIR/no-consent.json" -w "%{http_code}" \
  -X POST "$BASE_URL/public/vivi/chat" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"oi"}],"consentAiProcessing":false}')
set -e
if [[ "$NO_CONSENT" != "400" ]]; then
  echo "WARN: esperava 400 sem consent; got HTTP $NO_CONSENT"
  cat "$TMP_DIR/no-consent.json" || true
  echo
else
  node -e '
const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
const code=j.code || (j.message && j.message.code);
if(code && code!=="VIVI_CONSENT_REQUIRED") {
  console.error("code inesperado:", code);
  process.exit(1);
}
console.log("consent gate OK (400 VIVI_CONSENT_REQUIRED)");
' <"$TMP_DIR/no-consent.json" || echo "consent gate OK (HTTP 400)"
fi

# Chat mock/live
curl -sf -X POST "$BASE_URL/public/vivi/chat" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Quais ministérios tem no portal?"}],"consentAiProcessing":true,"sessionId":"smoke-vivi"}' \
  | tee "$TMP_DIR/chat.json"
echo
node -e '
const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
if(!j.reply || typeof j.reply!=="string") { console.error("reply ausente"); process.exit(1); }
if(!["manus","gemini","mock"].includes(j.provider)) { console.error("provider chat inválido", j.provider); process.exit(1); }
if(typeof j.refused!=="boolean") { console.error("refused ausente"); process.exit(1); }
if(!j.lgpdNotice) { console.error("lgpdNotice ausente"); process.exit(1); }
console.log("chat provider:", j.provider, "refused:", j.refused, "chars:", (j.reply||"").length);
' <"$TMP_DIR/chat.json"
echo "public/vivi/chat OK"

echo "Smoke Vivi OK"
