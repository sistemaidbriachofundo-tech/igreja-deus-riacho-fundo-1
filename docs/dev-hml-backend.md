# DEV / HML — Backend (sem produção)

## Escopo
- API Nest (`apps/api`) + Postgres 16 + (opcional) Redis
- **Não** publicar produção neste documento
- Dados **apenas fictícios** (seed)

## Compose local (DEV)
```bash
docker compose up -d postgres
cp .env.example .env
# JWT_SECRET ≥ 32 chars; em HML/PRD sem prefixo dev-only-
npm ci
npm run build -w @idbrf/shared && npm run build -w @idbrf/db
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run db:seed
npm run build -w @idbrf/api && npm run start:prod -w @idbrf/api
# Base URL FE: http://localhost:3001
```

## Variáveis HML (checklist)
| Var | Obrigatório | Nota |
|-----|-------------|------|
| `DATABASE_URL` | sim | Postgres HML |
| `JWT_SECRET` | sim | ≥32, sem `dev-only-` |
| `JWT_EXPIRES_SECONDS` | não | default 3600 |
| `NODE_ENV` | sim | `production` em HML |
| `CORS_ORIGIN` | sim se `NODE_ENV=production` | CSV origens FE HML |
| `API_PORT` | não | default 3001 |
| `RATE_LIMIT_MAX` | não | default 30 / janela |
| `RATE_LIMIT_WINDOW_MS` | não | default 60000 |

## Backup / restore
```bash
./scripts/pg-backup-restore-smoke.sh
```
Restore smoke cria DB paralelo `idbrf_restore_smoke`, restaura dump e compara `count(persons)`.

## Health
- `GET /health` — liveness
- `GET /ready` — readiness; 503 quando Postgres indisponível
- `API_BASE=http://127.0.0.1:3001 npm run homolog:readiness` — smoke sem escrita
- Monitoramento futuro: uptime + alertas (fora deste slice)

## FE
`NEXT_PUBLIC_API_URL=<base HML HTTPS>` após API HML disponível.  
GitHub Pages permanece estático (sem API embutida).
