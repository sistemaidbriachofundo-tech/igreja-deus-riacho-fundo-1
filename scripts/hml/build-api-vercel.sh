#!/usr/bin/env bash
# Exclusivo HML Fase 1. Nunca executar em banco de produção.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ "${SEED_HML_MASS:-}" != "true" ]]; then
  echo "BLOQUEADO: SEED_HML_MASS=true obrigatório para preparar esta HML" >&2
  exit 2
fi
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
npm run seed -w @idbrf/db
npm run build -w @idbrf/api
echo "HML compilada, migrações e massa sintética idempotente aplicadas."
