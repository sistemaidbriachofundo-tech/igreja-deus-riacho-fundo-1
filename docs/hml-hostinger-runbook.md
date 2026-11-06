# Runbook HML Hostinger — Backend IDBRF

**Status URL pública:** `TBD` — **não** publicar sem autorização + credenciais.  
**Este documento + `deploy/hml/*` são artefatos ready-to-run**; sem VPS IP / domínio / SSH **não** há deploy real.

Espelho no Agent Store: pasta `docs/` do projeto (mesmo nome).  
Complementa: `docs/hml-runbook.md` (loopback local) · plano: store `docs/backend-hostinger-hml-plano.md`.

## Stack

| Peça | Artefato |
|------|----------|
| Postgres 16 + API Nest | `docker-compose.yml` + `docker-compose.hml.yml` |
| Imagem / migrate-on-boot | `Dockerfile.api` (`prisma migrate deploy`; seed se `SEED_ON_BOOT=1`) |
| Secrets | `.env.hml.example` → `.env.hml` · `deploy/hml/secrets-checklist.md` |
| TLS reverse proxy | `deploy/hml/nginx/*.template` **ou** `deploy/hml/caddy/*.template` |
| Bootstrap / smoke | `scripts/hml/bootstrap-hml.sh` · `scripts/smoke-hml.sh` · `scripts/smoke-vivi.sh` (legado: `scripts/hml/smoke-hml.sh`) |
| Go-live único | `docs/go-live-hml-vivi.md` |
| Render templates | `scripts/hml/render-proxy-templates.sh` |

Bind HML: **somente** `127.0.0.1:3001` (API) e `127.0.0.1:5432` (Postgres). Exposição pública = reverse proxy HTTPS autorizado.

## Pré-requisitos (bloqueadores do usuário)

| # | Item | Status |
|---|------|--------|
| 1 | VPS Hostinger IP | **precisa usuário** |
| 2 | Hostname API (ex. `api-hml.…`) + DNS A/AAAA | **precisa usuário** |
| 3 | SSH (user + chave/senha) e permissão sudo/docker | **precisa usuário** |
| 4 | Origem FE HML para `CORS_ORIGIN` | **precisa usuário** |
| 5 | Autorização explícita para abrir 80/443 | **precisa usuário** |
| — | SonarCloud / CI | **OK** (não bloqueia VPS) |
| — | OpenAPI `0.5.0-portal` + handoff FE | **OK** no repo |

Sem os itens 1–5: rodar apenas `--dry-run` local / validar compose; **não** conectar a Hostinger.

## Ordem de execução (quando credenciais existirem)

### 1. Servidor

```bash
# no VPS (exemplo — NÃO executar daqui sem SSH)
sudo apt update && sudo apt install -y docker.io docker-compose-v2 curl
# ou Docker Engine oficial + plugin compose
git clone <repo> && cd igreja-deus-riacho-fundo-1
git checkout main   # ou tag/PR aprovado
```

### 2. Secrets

```bash
cp .env.hml.example .env.hml
chmod 600 .env.hml
# editar: POSTGRES_PASSWORD, JWT_SECRET (≥32, sem dev-only-), CORS_ORIGIN
# primeiro boot: SEED_ON_BOOT=1
```

Ver `deploy/hml/secrets-checklist.md`.

### 3. Compose (loopback)

```bash
export HML_API_HOSTNAME=api-hml.SEU_DOMINIO
export CORS_ORIGIN=https://FE_HML_ORIGIN
./scripts/hml/bootstrap-hml.sh --dry-run   # valida
./scripts/hml/bootstrap-hml.sh             # up -d --build + health
./scripts/smoke-hml.sh                     # health, meta, public/home (+ login)
./scripts/smoke-vivi.sh                    # /vivi/status + chat mock/consent
```

Migrate-on-boot: o `CMD` de `Dockerfile.api` sempre roda  
`npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`  
antes de `node apps/api/dist/main.js`. Seed fictício só com `SEED_ON_BOOT=1`.

### 4. TLS (só após DNS)

Escolher **um** proxy:

```bash
export HML_API_HOSTNAME=api-hml.SEU_DOMINIO
./scripts/hml/render-proxy-templates.sh
# Revisar deploy/hml/rendered/ …
# Nginx: copiar conf + certbot; ou Caddy: copiar Caddyfile e reload
```

Depois:

1. Abrir 80/443 no firewall Hostinger  
2. Confirmar `curl -sf https://$HML_API_HOSTNAME/health`  
3. Registrar URL em `docs/hml-runbook.md` e nesteste arquivo (substituir `TBD`)  
4. Informar FE: `NEXT_PUBLIC_API_URL=https://…`  
5. Setar `HML_PUBLIC_API_URL` no `.env.hml` e recriar o serviço `api`  
6. Desligar seed: `SEED_ON_BOOT=0`

### 5. Backup smoke (antes de qualquer dado não-fictício)

```bash
./scripts/pg-backup-restore-smoke.sh
```

## Segurança HML

- Postgres e API **não** escutam em `0.0.0.0`
- `NODE_ENV=production` + `CORS_ORIGIN` obrigatório
- Rate limit login + verify carteirinha
- Storage admissão privado (`STORAGE_ROOT`) — sem URL pública de arquivo
- Dados **somente** seed fictício

## FE

Handoff consolidado (store): `docs/handoff-frontend-completo-das.md`  
Repo (parcial): `docs/handoff-frontend-api-f2.md` + `docs/handoff-frontend-portal-publico.md`

Até URL HML existir: DEV `http://localhost:3001`.

## Fora de escopo

- Produção com membros reais  
- Object storage S3-compat (disco local ok para HML)  
- OIDC/MFA, WhatsApp, finanças (F4/F5)  
- Merge automático / deploy produção neste PR
