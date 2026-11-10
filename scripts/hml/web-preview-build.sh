#!/usr/bin/env bash
# Export estático da prévia web. Não publica, não migra e não semeia.
set -euo pipefail
cd "$(dirname "$0")/../.."

mode="${1:-}"
project="${VERCEL_PROJECT_NAME:-}"
ref="${VERCEL_GIT_COMMIT_REF:-}"

if [[ -n "$project" && "$project" != "id-riacho1-web-hml" ]]; then
  echo "BLOQUEADO: a prévia web só pode rodar em id-riacho1-web-hml" >&2
  exit 2
fi
if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "BLOQUEADO: este script não faz deploy de produção" >&2
  exit 2
fi
if [[ "$ref" == "main" || "$ref" == "master" ]]; then
  echo "BLOQUEADO: a prévia protegida não publica a branch main. Use previa/rf1-v1." >&2
  exit 2
fi
if [[ -n "${SEED_HML_MASS:-}" || -n "${CONFIRM_HML_MIGRATE:-}" ]]; then
  echo "BLOQUEADO: a prévia web não aplica seed nem migration" >&2
  exit 2
fi
if [[ "${WEB_PREVIEW_DISABLE_SSO:-}" == "1" || "${WEB_PREVIEW_APPLY_REMOTE:-}" == "1" ]]; then
  echo "BLOQUEADO: a prévia não desliga SSO nem altera o projeto remoto" >&2
  exit 2
fi
if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "BLOQUEADO: DATABASE_URL não pertence ao projeto id-riacho1-web-hml" >&2
  exit 2
fi
if [[ -n "${JWT_SECRET:-}" || -n "${HML_DEMO_PASSWORD_HASH:-}" ]]; then
  echo "BLOQUEADO: segredo de API não pertence ao projeto web HML" >&2
  exit 2
fi

if [[ "$mode" == "--check" ]]; then
  echo "web-preview check ok project=${project:-local} env=${VERCEL_ENV:-local} ref=${ref:-local}"
  exit 0
fi

sha="${VERCEL_GIT_COMMIT_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD)}}"
export WEB_PREVIEW_CHANNEL=vercel-hml
export WEB_PREVIEW_SHA="$sha"
export NEXT_PUBLIC_BASE_PATH=""
export NEXT_PUBLIC_HML_ENABLED=true
export NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED=false
export NEXT_PUBLIC_PORTAL_LIVE_ENABLED=false
unset NEXT_PUBLIC_API_URL || true
export DATABASE_URL="postgresql://preview:preview@127.0.0.1:5432/web_preview_generate?schema=public"

echo "Prévia web HML sha=${sha} basePath vazio, API desligada, sem migrate e sem seed."
npm run build -w @idbrf/shared
npx prisma generate --schema packages/db/prisma/schema.prisma
npm run build -w @idbrf/db
node scripts/hml/web-preview-write-release.mjs
npm run build -w @idbrf/web
echo "Export estático em apps/web/out. Nenhum deploy foi enviado."
