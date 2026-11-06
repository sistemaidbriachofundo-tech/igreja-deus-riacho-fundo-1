#!/usr/bin/env bash
# Bootstrap HML no VPS Hostinger — ready-to-run AFTER credentials exist.
# Recusa executar sem variáveis mínimas. NÃO publica sozinho na internet:
# TLS/DNS/firewall ficam a cargo do operador (ver docs/hml-hostinger-runbook.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

need() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "BLOQUEADO: defina $name (credencial/host HML não fornecida neste ambiente)." >&2
    exit 2
  fi
}

usage() {
  cat <<'EOF'
Uso (no VPS, com repo clonado):
  export HML_API_HOSTNAME=api-hml.example.org
  export CORS_ORIGIN=https://fe-hml.example.org
  # opcional: HML_SSH_TARGET=user@vps-ip  (só se rodar via SSH remoto)
  cp .env.hml.example .env.hml   # editar POSTGRES_PASSWORD + JWT_SECRET
  ./scripts/hml/bootstrap-hml.sh

Flags:
  --dry-run   valida pré-requisitos e imprime planos; não sobe containers
  --no-seed   não seta SEED_ON_BOOT=1
EOF
}

DRY_RUN=0
DO_SEED=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-seed) DO_SEED=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Arg desconhecido: $arg" >&2; usage; exit 1 ;;
  esac
done

need HML_API_HOSTNAME
need CORS_ORIGIN

if [[ ! -f .env.hml ]]; then
  echo "BLOQUEADO: falta .env.hml (copie de .env.hml.example e preencha secrets)." >&2
  exit 2
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source .env.hml
set +a

need POSTGRES_PASSWORD
need JWT_SECRET

if [[ "$JWT_SECRET" == dev-only-* ]]; then
  echo "BLOQUEADO: JWT_SECRET não pode ter prefixo dev-only- em HML." >&2
  exit 2
fi
if [[ "${#JWT_SECRET}" -lt 32 ]]; then
  echo "BLOQUEADO: JWT_SECRET deve ter ≥ 32 caracteres." >&2
  exit 2
fi

export CORS_ORIGIN
if [[ "$DO_SEED" -eq 1 ]]; then
  export SEED_ON_BOOT=1
fi
export HML_PUBLIC_API_URL="${HML_PUBLIC_API_URL:-https://${HML_API_HOSTNAME}}"

echo "== HML bootstrap =="
echo "hostname: $HML_API_HOSTNAME"
echo "cors:     $CORS_ORIGIN"
echo "public:   $HML_PUBLIC_API_URL"
echo "seed:     ${SEED_ON_BOOT:-0}"
echo "dry-run:  $DRY_RUN"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.hml.yml --env-file .env.hml)

if [[ "$DRY_RUN" -eq 1 ]]; then
  if command -v docker >/dev/null 2>&1; then
    echo "[dry-run] ${COMPOSE[*]} config"
    "${COMPOSE[@]}" config >/dev/null
    echo "[dry-run] OK — compose válido."
  else
    echo "[dry-run] docker ausente neste host — pulando 'compose config' (ok em agent CI)."
    echo "[dry-run] secrets/JWT/CORS validados; arquivos compose presentes."
    test -f docker-compose.yml && test -f docker-compose.hml.yml
  fi
  echo "[dry-run] Próximo no VPS: subir com --build (sem dry-run)."
  echo "[dry-run] TLS: aplicar deploy/hml/nginx/*.template ou deploy/hml/caddy/*.template"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "BLOQUEADO: docker não encontrado no PATH." >&2
  exit 2
fi

"${COMPOSE[@]}" up -d --build

echo "Aguardando health loopback..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:3001/health" >/dev/null; then
    echo "OK health (tentativa $i)"
    curl -s "http://127.0.0.1:3001/meta" | head -c 400 || true
    echo
    echo "Lembrete: API ainda só em 127.0.0.1:3001 até o reverse proxy TLS estar ativo."
    echo "Não há publicação automática. Ver docs/hml-hostinger-runbook.md."
    exit 0
  fi
  sleep 2
done

echo "FALHA: /health não respondeu em 127.0.0.1:3001" >&2
"${COMPOSE[@]}" logs --tail=80 api || true
exit 1
