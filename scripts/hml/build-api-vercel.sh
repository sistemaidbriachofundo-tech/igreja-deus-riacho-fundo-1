#!/usr/bin/env bash
# Exclusivo HML Fase 1. Nunca executar em banco de produção.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ "${DATABASE_URL:-}" != *"idriacho1_hml"* ]]; then
  echo "BLOQUEADO: DATABASE_URL não aponta ao banco isolado idriacho1_hml" >&2
  exit 2
fi
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
