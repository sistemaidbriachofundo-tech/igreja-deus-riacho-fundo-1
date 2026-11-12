# Checklist de secrets — Produção Hostinger

**Não versionar valores reais. Não colar senhas/PII no chat.**

Ambiente distinto de HML. Girar qualquer segredo que tenha aparecido em histórico de deploy.

## Obrigatórios na API (VPS)

| Variável | Regra |
|----------|-------|
| `IDBRF_RUNTIME_STAGE` | `production` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Postgres prod, `sslmode=require` ou `verify-full` |
| `PRODUCTION_DATABASE_HOST` | hostname exatamente igual ao da URL |
| `PRODUCTION_DATABASE_NAME` | nome do DB exatamente igual ao da URL |
| `JWT_SECRET` | ≥32 chars, **sem** `dev-only-`, exclusivo de prod |
| `CORS_ORIGIN` | CSV HTTPS do portal (ex. `https://igrejadeusrf1.com.br`) |
| `TRUST_PROXY` | saltos do Traefik/proxy (ex. `1`) |
| `F11_MFA_BLOCKING` | `true` |
| `AUTH_STATE_STORE` | **não** `memory` |
| `RATE_LIMIT_STORE` | **não** `memory` (usar store compartilhado) |
| `PRIVATE_BLOB_READ_WRITE_TOKEN` | bucket privado ≠ token público |
| `STORAGE_ROOT` | path privado no volume (não exposto na web) |

## Proibidos em produção

| Item | Motivo |
|------|--------|
| `SEED_ON_BOOT=1` / `SEED_HML_MASS` | dados sintéticos |
| `HML_DEMO_PASSWORD_HASH` | só HML |
| Reusar `JWT_SECRET` / DB de HML ou Vercel | contaminação |
| Expor `5432` na internet | firewall só loopback / rede Docker |
| Commit de `.env` / chaves | vazamento |

## GitHub (pipeline)

| Item | Onde |
|------|------|
| `SONAR_TOKEN` | Environment `SONAR_TOKEN` |
| Environment `production` + reviewers | Settings → Environments |
| `PRODUCTION_API_URL` | Variables |
| `PRODUCTION_WEB_URL` | Variables |

## Antes do DNS

- [ ] Backup / ensaio de restore do Postgres prod (vazio ou sintético isolado)
- [ ] `/health` e `/ready` OK na API interna
- [ ] `npm run release:preflight` com SHA do artefato
- [ ] FE build do artefato `production-candidate-*` (apex, sem basePath Pages)
- [ ] Autorização explícita para corte de DNS
