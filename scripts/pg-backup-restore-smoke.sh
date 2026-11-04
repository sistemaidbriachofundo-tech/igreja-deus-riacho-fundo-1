#!/usr/bin/env bash
# Smoke backup/restore Postgres DEV (dados fictícios). Não usar em produção.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
set -a
# Prefer .env if present
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(DATABASE_URL|POSTGRES_)=*' "$ROOT/.env" | sed 's/\r$//')
fi
set +a

RAW_URL="${DATABASE_URL:-postgresql://idbrf:idbrf_dev_only@localhost:5432/idbrf}"
# pg_dump não aceita ?schema= do Prisma — remove querystring
DB_URL="${RAW_URL%%\?*}"
BACKUP="${TMPDIR:-/tmp}/idbrf-homolog-backup-$$.sql"

echo "Dump → $BACKUP"
pg_dump "$DB_URL" --no-owner --no-acl > "$BACKUP"
BYTES=$(wc -c < "$BACKUP")
echo "Backup size: $BYTES bytes"
test "$BYTES" -gt 1000

# Contagem antes
BEFORE=$(psql "$DB_URL" -Atc 'SELECT count(*) FROM persons')
echo "persons before restore check: $BEFORE"

# Restore em DB paralelo (não destrói o DEV ativo).
# Usa peer/local superuser quando disponível (sudo -u postgres); senão tenta DATABASE_URL admin.
VERIFY_DB=idbrf_restore_smoke
ADMIN_URL="${PG_ADMIN_URL:-}"
run_admin() {
  if [[ -n "$ADMIN_URL" ]]; then
    psql "$ADMIN_URL" -v ON_ERROR_STOP=1 "$@"
  elif command -v sudo >/dev/null && id -u postgres >/dev/null 2>&1 || getent passwd postgres >/dev/null; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"
  else
    echo "Defina PG_ADMIN_URL (postgres superuser) para o smoke de restore" >&2
    exit 1
  fi
}

run_admin <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${VERIFY_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${VERIFY_DB};
CREATE DATABASE ${VERIFY_DB} OWNER idbrf;
SQL

psql "${DB_URL%/*}/${VERIFY_DB}" -v ON_ERROR_STOP=1 < "$BACKUP" >/dev/null
AFTER=$(psql "${DB_URL%/*}/${VERIFY_DB}" -Atc 'SELECT count(*) FROM persons')
echo "persons after restore into ${VERIFY_DB}: $AFTER"
test "$AFTER" = "$BEFORE"

run_admin -c "DROP DATABASE IF EXISTS ${VERIFY_DB};" >/dev/null
rm -f "$BACKUP"
echo "BACKUP/RESTORE SMOKE OK"
