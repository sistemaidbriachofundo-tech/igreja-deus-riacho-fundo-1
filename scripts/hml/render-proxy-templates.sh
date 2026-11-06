#!/usr/bin/env bash
# Renderiza templates nginx/Caddy com HML_API_HOSTNAME. Não instala no sistema.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${HML_PROXY_OUT:-$ROOT/deploy/hml/rendered}"

if [[ -z "${HML_API_HOSTNAME:-}" ]]; then
  echo "BLOQUEADO: exporte HML_API_HOSTNAME=api-hml.example.org" >&2
  exit 2
fi

mkdir -p "$OUT/nginx" "$OUT/caddy"

render() {
  local src="$1" dest="$2"
  python3 - "$src" "$dest" "$HML_API_HOSTNAME" <<'PY'
import sys
src, dest, host = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding="utf-8").read().replace("__HML_API_HOSTNAME__", host)
open(dest, "w", encoding="utf-8").write(text)
PY
}

render "$ROOT/deploy/hml/nginx/idbrf-api-hml.conf.template" "$OUT/nginx/idbrf-api-hml.conf"
render "$ROOT/deploy/hml/caddy/Caddyfile.template" "$OUT/caddy/Caddyfile"

echo "Renderizado em $OUT (não aplicado ao host)."
echo "Revisar e copiar manualmente para /etc/nginx ou /etc/caddy após DNS/TLS."
