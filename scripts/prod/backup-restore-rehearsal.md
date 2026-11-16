# Ensaio de backup/restore (produção)

O smoke DEV `scripts/pg-backup-restore-smoke.sh` **não** substitui este ensaio.

## Objetivo

Provar que um dump off-host restaura em banco **isolado** com contagens coerentes.

## Passos

1. No host com acesso Postgres de produção (ou réplica de leitura autorizada), confirme o nome do banco e use `PRODUCTION_BACKUP_URL` no formato aceito pelo `pg_dump`. Preserve o TLS e remova parâmetros específicos do Prisma, como `schema`.

```bash
umask 077
backup="idbrf-prod-$(date -u +%Y%m%dT%H%M%S).dump"
pg_dump --format=custom --no-owner --file="$backup" "$PRODUCTION_BACKUP_URL"
sha256sum "$backup"
```

2. Aponte `REHEARSAL_DATABASE_URL` para um banco isolado, vazio e recém-criado. Confirme que ele é distinto da origem antes de restaurar.

```bash
pg_restore --exit-on-error --single-transaction --no-owner   --dbname="$REHEARSAL_DATABASE_URL" "$backup"
```

3. Conferir:

```sql
SELECT count(*) FROM persons;
SELECT count(*) FROM users;
SELECT migration_name FROM _prisma_migrations
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
ORDER BY migration_name DESC LIMIT 5;
```

4. Registrar no runbook: data, operador, contagens, SHA do dump, resultado PASS/FAIL.
5. Após validar a restauração, use apenas o banco de ensaio para aplicar as migrações candidatas, testar o backend e conferir as contagens novamente.

## Critério PASS

- Restore completa sem erro bloqueante
- `count(persons)` bate com a origem (±0) no momento do dump
- Migrações Prisma presentes

## Relacionado

- Secrets: `deploy/prod/secrets-checklist.md`
- Liberação: `docs/liberacao-producao.md`
