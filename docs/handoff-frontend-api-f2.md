# Handoff FE ← BE — contratos F2 (ChatGPT / `apps/web`)

**Contrato:** OpenAPI `packages/shared/openapi/f2-v0.2.yaml` · `API_CONTRACT_VERSION = "0.2.3-f2"`  
**Prefixo:** nenhum (`API_PATH_PREFIX = ""`)  
**Base DEV:** `http://localhost:3001`  
**Base HML:** **TBD** (não publicada) — ver `docs/hml-runbook.md`  
**Descoberta:** `GET /meta` (público) devolve `contractVersion` + mapa `endpoints`.

> Backend **não** altera `apps/web`.

## Auth

| Método | Path | Auth | Status |
|--------|------|------|--------|
| POST | `/auth/login` | público | **implemented** |
| GET | `/auth/me` | Bearer | **implemented** |
| GET | `/auth/rbac-smoke` | SECRETARIA | **implemented** (smoke) |

Login body `{ email, password }` → 201 `{ accessToken, tokenType, expiresInSeconds, user }`  
Header: `Authorization: Bearer <token>`

### Seed fictício

| Email | Senha | Papel |
|-------|-------|-------|
| `ana.demo@example.test` | `admin` | SECRETARIA |
| `pastor.demo@example.test` | `admin` | PASTOR |
| `bruno.demo@example.test` | `admin` | MEMBRO |

## Pessoas / famílias (0.2.1–0.2.3)

| Método | Path | Papéis | Status |
|--------|------|--------|--------|
| GET | `/persons/search?q=&limit=` | SECRETARIA, PASTOR, PLATFORM_ADMIN | **implemented** |
| GET | `/persons/:personId` | staff ou próprio MEMBRO | **implemented** |
| GET | `/persons/:personId/dossier` | staff ou próprio MEMBRO | **implemented** |
| PATCH | `/persons/:personId` | SECRETARIA | **implemented** — `isMinor`, `legalGuardianPersonId`, `householdId` |
| GET | `/households` | SECRETARIA | **implemented** (0.2.3) |
| POST | `/households` | SECRETARIA | **implemented** |
| GET | `/households/:id` | SECRETARIA | **implemented** |
| POST | `/households/:id/members` | SECRETARIA | **implemented** |
| DELETE | `/households/:id/members/:personId` | SECRETARIA | **implemented** |

- Busca: `autoMergeForbidden: true` sempre  
- Menor **exige** responsável legal adulto no mesmo org  
- Seed: `demoPersonMenor01` (Eduardo) com guardião `demoPersonRiacho01` (Ana)

## Admissão + documentos

| Método | Path | Status |
|--------|------|--------|
| GET/POST | `/admissions` | **implemented** |
| GET | `/admissions/:id` | **implemented** |
| POST | `/admissions/:id/advance` | **implemented** |
| GET/POST | `/admissions/:id/documents` | **implemented** (multipart `file`) |
| GET | `/admissions/:id/documents/:documentId` | **implemented** (download autorizado) |

Tipos: PDF/JPEG/PNG ≤ 5 MiB. Storage privado (`STORAGE_ROOT`) — **sem URL pública**.

### Erros de negócio

| HTTP | `code` |
|------|--------|
| 401 | JWT |
| 403 | papel / `ADMISSION_ROLE_REQUIRED` |
| 404 | recurso fora do piloto |
| 409 | `ADMISSION_STEP_LOCKED`, `ADMISSION_ALREADY_OPEN`, `ADMISSION_CLOSED`, `MEMBERSHIP_ALREADY_ACTIVE`, `CREDENTIAL_NOT_ELIGIBLE` |
| 429 | `RATE_LIMITED` |

## Membresia / carteirinha

| Path | Status | Nota |
|------|--------|------|
| GET/POST `/memberships` | **implemented** | preferir `/admissions` |
| GET `/credentials/me` | **implemented** | |
| POST `/credentials/issue|reissue|revoke/...` | **implemented** | gate pastoral |
| GET `/credentials/verify/:opaqueToken` | **implemented** | público + rate limit |

## Auditoria

| Método | Path | Papéis | Status |
|--------|------|--------|--------|
| GET | `/audit-logs?limit=` | SECRETARIA, PASTOR, PLATFORM_ADMIN | **implemented** |

## Pendente / precisa aprovação

| Item | Status |
|------|--------|
| URL HML HTTPS pública | **pendente autorização** (`TBD` no runbook) |
| Object storage gerenciado (S3) | arquitetura local pronta; migração cloud pendente |
| OIDC/MFA | proposed |
| Transferência entre igrejas | proposed |

## Como testar

```bash
npm run build -w @idbrf/shared && npm run build -w @idbrf/db
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run db:seed
npm run build -w @idbrf/api && npm run start:prod -w @idbrf/api
npm run homolog:m1
```
