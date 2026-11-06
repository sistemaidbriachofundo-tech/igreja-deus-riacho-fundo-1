# Checklist de secrets — HML Hostinger

**Não versionar valores reais.** Preencher no servidor (`.env.hml` mode 600) ou no painel de secrets.

## Obrigatórios antes do `compose up`

| Variável | Regra | Onde |
|----------|-------|------|
| `POSTGRES_PASSWORD` | forte, único HML | `.env.hml` |
| `JWT_SECRET` | ≥32 chars, **sem** prefixo `dev-only-` | `.env.hml` |
| `CORS_ORIGIN` | CSV HTTPS do FE HML (ex. Pages preview / domínio FE) | `.env.hml` |
| `NODE_ENV` | `production` (já no compose HML) | compose |

## Recomendados

| Variável | Regra |
|----------|-------|
| `SEED_ON_BOOT` | `1` só no **primeiro** boot HML (dados fictícios); depois `0`/`unset` |
| `HML_API_HOSTNAME` | hostname API para render proxy / DNS |
| `HML_PUBLIC_API_URL` | HTTPS público após TLS — ecoado em `GET /meta` |
| `HML_BASE_URL` | alvo `scripts/smoke-hml.sh` / `scripts/smoke-vivi.sh` |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | defaults 30 / 60000 ok para HML |
| `STORAGE_ROOT` | volume Docker `/var/lib/idbrf/private-storage` (já no compose) |

## Vivi (HML live)

| Variável | Regra |
|----------|-------|
| `VIVI_PROVIDER` | `manus` preferido; `mock` só se IA desligada de propósito |
| `MANUS_FORGE_URL` + `MANUS_API_KEY` | **precisa usuário** — aliases `BUILT_IN_FORGE_*` |
| `GEMINI_API_KEY` + `GEMINI_MODEL` | opcional se Manus ok; default model `gemini-2.5-flash-lite` |
| `VIVI_PUBLIC_RATE_MAX` / `VIVI_AUDIT` | defaults 8 / 1 |

`NODE_ENV=production` + `VIVI_PROVIDER=manus|gemini` **sem** key → boot **falha** (não sobe mock silencioso). Ver `docs/go-live-hml-vivi.md`.

## Host / TLS (fora do `.env.hml`)

| Item | Status típico |
|------|----------------|
| VPS IP Hostinger | **precisa usuário** |
| Hostname API (`api-hml.…`) | **precisa usuário** |
| DNS A/AAAA → VPS | **precisa usuário** |
| SSH user + key/password | **precisa usuário** |
| Certificado TLS (Let's Encrypt / painel) | após DNS |
| Firewall: 22 (admin), 80/443 públicos; **5432/3001 só loopback** | na provision |

## Já ok (não bloqueia HML)

| Item | Nota |
|------|------|
| SonarCloud token / CI | OK — não necessário no VPS |
| OpenAPI `0.5.0-portal` | no repo |
| `Dockerfile.api` migrate-on-boot | no repo |

## Proibido em HML

- Dados reais de membros / CPF / documentos reais
- Publicar produção neste fluxo
- Expor Postgres ou `STORAGE_ROOT` na internet
- Commit de `.env.hml` ou chaves privadas
