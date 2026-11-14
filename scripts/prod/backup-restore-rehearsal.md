# Ensaio de backup/restore (produção)

O smoke DEV `scripts/pg-backup-restore-smoke.sh` **não** substitui este ensaio.

## Objetivo

Provar que um dump off-host restaura em banco **isolado** com contagens coerentes.

## Passos

1. No host com acesso Postgres de produção (ou réplica de leitura autorizada):

```bash
pg_dump --format=custom --no-owner --file="idbrf-prod-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"
```

2. Criar banco isolado (nunca sobrescrever produção):

```bash
createdb idbrf_restore_rehearsal
pg_restore --clean --if-exists --no-owner --dbname="$REHEARSAL_DATABASE_URL" ./idbrf-prod-….dump
```

3. Conferir:

```sql
SELECT count(*) FROM persons;
SELECT count(*) FROM users;
SELECT version FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 5;
```

4. Registrar no runbook: data, operador, contagens, SHA do dump, resultado PASS/FAIL.
5. Apagar o banco de ensaio.

## Critério PASS

- Restore completa sem erro bloqueante
- `count(persons)` bate com a origem (±0) no momento do dump
- Migrações Prisma presentes

## Relacionado

- Secrets: `deploy/prod/secrets-checklist.md`
- Liberação: `docs/liberacao-producao.md`
