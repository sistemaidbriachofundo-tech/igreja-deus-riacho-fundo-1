# Checklist go-live — HML Hostinger + Vivi + contratos

**Repo:** https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1  
**Contrato:** `0.7.1-vivi` · OpenAPI `packages/shared/openapi/f2-v0.2.yaml`  
**Espelho no Agent Store:** `docs/go-live-hml-vivi.md`  
**Baselines:** `docs/backend-baseline-consolidado.md` · `docs/hml-hostinger-runbook.md` · `docs/handoff-vivi-ai.md`  
**Status URL pública API:** `TBD` — **sem** deploy real sem credenciais + autorização.

> Este checklist é o **único** caminho operacional HML+Vivi. Não merge/deploy sem autorização explícita.

---

## 0. Bloqueios do usuário (não dá deploy daqui)

| # | Item | Por quê |
|---|------|---------|
| 1 | **VPS IP Hostinger** | Sem alvo SSH/DNS |
| 2 | **SSH** (user + chave/senha) + docker no VPS | Sem provision |
| 3 | **`MANUS_API_KEY`** (ou `BUILT_IN_FORGE_API_KEY`) + `MANUS_FORGE_URL` | Vivi Manus live |
| 4 | **`GEMINI_API_KEY`** (opcional se Manus ok) | Fallback Google AI Studio |
| 5 | **Hostname API** (`api-hml.…`) + DNS A/AAAA | TLS + URL pública |
| 6 | **`CORS_ORIGIN`** = URL FE HML | API em `NODE_ENV=production` |
| 7 | Autorização para abrir **80/443** | Exposição HTTPS |
| 8 | Autorização de **merge/deploy** | Política do projeto |

**Já no repo (não bloqueia checklist de artefatos):** CI/Sonar · migrate-on-boot · compose HML · gateway Vivi · smoke scripts · templates nginx/Caddy · contrato `0.7.1-vivi`.

Sem 1–4 + 7–8: validar só local/loopback (`bootstrap-hml.sh --dry-run`, `scripts/smoke-*.sh` contra `127.0.0.1`). **Não** conectar Hostinger real.

---

## 1. Secrets (preencher no VPS — nunca no Git/FE)

Checklist detalhado: `deploy/hml/secrets-checklist.md` · templates: `.env.hml.example` · `.env.example`.

### Obrigatórios API HML

| Variável | Regra |
|----------|-------|
| `POSTGRES_PASSWORD` | forte, único HML |
| `JWT_SECRET` | ≥32 chars, **sem** `dev-only-` |
| `CORS_ORIGIN` | CSV HTTPS do FE HML |
| `NODE_ENV` | `production` |
| `STORAGE_ROOT` | path privado (compose: `/var/lib/idbrf/private-storage`) |

### Vivi (só backend)

| Variável | Regra |
|----------|-------|
| `VIVI_PROVIDER` | `manus` (preferido) \| `gemini` \| `mock` |
| `MANUS_FORGE_URL` + `MANUS_API_KEY` | default live; aliases `BUILT_IN_FORGE_*` |
| `GEMINI_API_KEY` + `GEMINI_MODEL` | opcional; default model `gemini-2.5-flash-lite` |
| `VIVI_PUBLIC_RATE_MAX` | default `8` |
| `VIVI_AUDIT` | `1` recomendado (metadados sem prompt) |

**Proibido:** `NEXT_PUBLIC_*` com chaves Manus/Gemini · commit de `.env` / `.env.hml`.

Em `NODE_ENV=production`, se `VIVI_PROVIDER=manus|gemini` **sem** credenciais, a API **falha no boot** com mensagem clara (não sobe mock silencioso).

### HML ops / smoke

| Variável | Uso |
|----------|-----|
| `HML_API_HOSTNAME` | render proxy + DNS |
| `HML_PUBLIC_API_URL` | ecoado em `GET /meta` após TLS |
| `HML_BASE_URL` | alvo dos smokes (`https://…` ou loopback) |
| `HML_SMOKE_EMAIL` / `HML_SMOKE_PASSWORD` | login seed (default demo) |
| `SEED_ON_BOOT` | `1` só no **primeiro** boot; depois `0` |

---

## 2. Passos Hostinger (quando 1–8 existirem)

1. SSH no VPS → Docker + compose plugin.  
2. Clonar repo (`main` ou tag/PR aprovado).  
3. `cp .env.hml.example .env.hml && chmod 600 .env.hml` — preencher secrets + Vivi.  
4. `SEED_ON_BOOT=1` no primeiro boot.  
5. `export HML_API_HOSTNAME=… CORS_ORIGIN=…`  
6. `./scripts/hml/bootstrap-hml.sh --dry-run` → `./scripts/hml/bootstrap-hml.sh`  
7. Loopback: `./scripts/smoke-hml.sh` e `./scripts/smoke-vivi.sh` (`HML_BASE_URL=http://127.0.0.1:3001`).  
8. DNS → `./scripts/hml/render-proxy-templates.sh` → nginx **ou** Caddy → TLS.  
9. Abrir 80/443; confirmar `curl -sf https://$HML_API_HOSTNAME/health`.  
10. Setar `HML_PUBLIC_API_URL` + FE `NEXT_PUBLIC_API_URL`; `SEED_ON_BOOT=0`; recrear `api`.  
11. Smoke público: `HML_BASE_URL=https://$HML_API_HOSTNAME ./scripts/smoke-hml.sh` + `./scripts/smoke-vivi.sh`.  
12. `./scripts/pg-backup-restore-smoke.sh` antes de qualquer dado não-fictício.  
13. Registrar URL (substituir `TBD`); **não** merge/produção sem nova autorização.

Detalhe: `docs/hml-hostinger-runbook.md`.

---

## 3. CORS + DNS

- **CORS:** `CORS_ORIGIN` = origem exata do FE HML (HTTPS). CSV se várias. Sem isso a API **não sobe** em production.  
- **DNS:** A/AAAA do hostname API → IP VPS **antes** do TLS.  
- FE: `NEXT_PUBLIC_API_URL=https://api-hml.…` (sem chaves IA).

---

## 4. Smoke curl (mínimo)

Substitua `$BASE` por `http://127.0.0.1:3001` (loopback) ou `https://api-hml.…` (após TLS).

```bash
# Health + contrato
curl -sf "$BASE/health"
curl -sf "$BASE/meta"   # contractVersion 0.7.1-vivi · hmlPublicUrl

# Portal público
curl -sf "$BASE/public/home"

# Vivi
curl -sf "$BASE/vivi/status"
# Esperado: credentialsReady true se Manus/Gemini configurados;
# configWarnings[] vazio em HML live.

curl -sf -X POST "$BASE/public/vivi/chat" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Quais ministérios tem no portal?"}],"consentAiProcessing":true,"sessionId":"smoke-vivi"}'
# Sem consent → 400 VIVI_CONSENT_REQUIRED
```

Scripts: `scripts/smoke-hml.sh` · `scripts/smoke-vivi.sh` (também `scripts/hml/smoke-hml.sh` legado loopback+login).

---

## 5. Contratos / descoberta FE

| Checagem | Esperado |
|----------|----------|
| `GET /meta` → `contractVersion` | `0.7.1-vivi` |
| `API_ENDPOINT_STATUS["POST /public/vivi/chat"]` | `implemented` |
| `GET /vivi/status` | provider/modelo **sem** secrets; `manusKeyConfigured` boolean |
| Portal | `/public/*` (home, ministérios, CMS) |

Handoff Vivi: `docs/handoff-vivi-ai.md`.

---

## 6. O que este agente NÃO faz

- Deploy Hostinger / SSH / DNS live  
- Preencher ou inventar `MANUS_*` / `GEMINI_*`  
- Merge de PR / promoção a produção  
- Redesign FE  

Entrega possível sem credenciais: este checklist · smokes · `.env*.example` · validação BE de provider sem key · draft PR.
