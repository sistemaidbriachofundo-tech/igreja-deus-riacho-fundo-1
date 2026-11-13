# Checklist de secrets — Produção Hostinger

**Não versionar valores reais. Não colar senhas/PII no chat.**

Ambiente distinto de HML. Girar qualquer segredo que tenha aparecido em histórico de deploy.

## Obrigatórios na API (VPS)

| Variável | Regra |
|----------|-------|
| `SOURCE_SHA` | SHA completo do commit da API publicada, configurado no processo ou no build da imagem |
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
| `PRODUCTION_API_URL` | Variables, `https://api.igrejadeusrf1.com.br` |
| `PRODUCTION_WEB_URL` | Variables |

## Antes do DNS

- [ ] Backup / ensaio de restore do Postgres prod (vazio ou sintético isolado)
- [ ] `/health` e `/ready` OK na API interna
- [ ] Após publicar a API, rodar `npm run release:preflight` com o SHA do artefato e confirmar `/meta` e `/ready`
- [ ] Frontend do artefato `production-candidate-*` com `NEXT_PUBLIC_ADMIN_PRODUCTION=true`, `NEXT_PUBLIC_HML_ENABLED=false` e a API oficial
- [ ] Conferir login, MFA e acesso por função com uma conta autorizada de produção
- [ ] Autorização explícita para corte de DNS
