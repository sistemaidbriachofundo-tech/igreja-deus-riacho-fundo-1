#!/usr/bin/env bash
# Exclusivo HML Fase 1. Nunca executar em banco de produção.
set -euo pipefail
cd "$(dirname "$0")/../.."

database_name="${DATABASE_URL:-}"
database_name="${database_name%%\?*}"
database_name="${database_name##*/}"
if [[ "$database_name" != "idriacho1_hml" ]]; then
  echo "BLOQUEADO: o banco alvo não é o Neon isolado idriacho1_hml" >&2
  exit 2
fi
if [[ "${VERCEL_PROJECT_NAME:-id-riacho1-api-hml}" != "id-riacho1-api-hml" ]]; then
  echo "BLOQUEADO: o projeto Vercel não é id-riacho1-api-hml" >&2
  exit 2
fi
SOURCE_SHA="$(git rev-parse HEAD)"
export SOURCE_SHA
echo "SOURCE_SHA=${SOURCE_SHA}"
echo "Compila e migra somente o projeto id-riacho1-api-hml no banco idriacho1_hml. Não publica a API e não altera produção."
if [[ "${NODE_ENV:-}" != "production" || "${#JWT_SECRET}" -lt 32 || -z "${HML_DEMO_PASSWORD_HASH:-}" ]]; then
  echo "BLOQUEADO: NODE_ENV, JWT_SECRET ou hash de testes inválido" >&2
  exit 2
fi
npm run build -w @idbrf/shared
npx prisma generate --schema packages/db/prisma/schema.prisma
npm run build -w @idbrf/db
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
if [[ "${SEED_HML_MASS:-}" == "true" ]]; then
  npm run seed -w @idbrf/db
fi
npm run build -w @idbrf/api
echo "HML compilada e migrações verificadas; seed somente quando explicitamente habilitado."
