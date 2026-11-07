# Handoff FE ← BE — contratos F2 (ChatGPT / `apps/web`)

**Contrato:** OpenAPI `packages/shared/openapi/f2-v0.2.yaml` · `API_CONTRACT_VERSION = "0.7.2-f2"` (DAS F1–F6 + Vivi + fechamento F2)  
**Prefixo:** nenhum (`API_PATH_PREFIX = ""`)  
**Base DEV:** `http://localhost:3001`  
**Base HML:** **TBD** (não publicada) — ver `docs/hml-runbook.md` / `docs/hml-hostinger-runbook.md`  
**Descoberta:** `GET /meta` (público) devolve `contractVersion` + mapa `endpoints` (`implemented` | `proposed`).  
**Handoff consolidado (store):** `docs/handoff-frontend-completo-das.md` (F2/F3 + portal + exemplos).

> Backend **não** altera `apps/web`.

## Auth

| Método | Path | Auth | Status |
|--------|------|------|--------|
| POST | `/auth/login` | público | **implemented** — grava `audit_logs` (`auth.login` / `auth.login_failed`) sem e-mail/senha em claro |
| GET | `/auth/me` | Bearer | **implemented** |
| POST | `/auth/refresh` | Bearer | **implemented** |
| POST | `/auth/switch-church` | Bearer | **implemented** |
| GET | `/auth/rbac-smoke` | SECRETARIA | **implemented** (smoke; fora do OpenAPI) |

Login body `{ email, password }` → `{ accessToken, tokenType, expiresInSeconds, user, mfa? }`  
Header: `Authorization: Bearer <token>`  
`user` inclui `organizationId` / `churchId` ativos (F6).

### Seed fictício

| Email | Senha | Papel |
|-------|-------|-------|
| `ana.demo@example.test` | `admin` | SECRETARIA |
| `pastor.demo@example.test` | `admin` | PASTOR |
| `bruno.demo@example.test` | `admin` | MEMBRO |
| `demoPersonMenor01` (Eduardo) | — | menor; guardião Ana |

## Pessoas / famílias

| Método | Path | Papéis | Status |
|--------|------|--------|--------|
| GET | `/persons/search?q=&limit=` | SECRETARIA, PASTOR, PLATFORM_ADMIN | **implemented** |
| GET | `/persons/:personId` | staff ou próprio MEMBRO | **implemented** (`kind`, `isMinor`, `legalGuardianPersonId`) |
| GET | `/persons/:personId/dossier` | staff ou próprio MEMBRO | **implemented** |
| PATCH | `/persons/:personId` | SECRETARIA | **implemented** |
| GET | `/households` | SECRETARIA | **implemented** |
| POST | `/households` | SECRETARIA | **implemented** (resposta com `members[]`) |
| GET | `/households/:id` | SECRETARIA | **implemented** |
| POST | `/households/:id/members` | SECRETARIA | **implemented** |
| DELETE | `/households/:id/members/:personId` | SECRETARIA | **implemented** |

- Busca: `autoMergeForbidden: true` sempre  
- Menor **exige** responsável legal adulto no mesmo org  

## Admissão + documentos

| Método | Path | Status |
|--------|------|--------|
| GET/POST | `/admissions` | **implemented** |
| GET | `/admissions/:id` | **implemented** |
| POST | `/admissions/:id/advance` | **implemented** |
| POST | `/admissions/:id/cancel` | **implemented** (SECRETARIA → `CANCELLED`) |
| GET/POST | `/admissions/:id/documents` | **implemented** (multipart `file`) |
| GET | `/admissions/:id/documents/:documentId` | **implemented** (download) |
| DELETE | `/admissions/:id/documents/:documentId` | **implemented** (SECRETARIA) |

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
| GET/POST `/memberships` | **implemented** | preferir `/admissions`; list inclui `person.kind` / `isMinor` |
| GET `/credentials/me` | **implemented** | |
| POST `/credentials/issue\|reissue\|revoke/...` | **implemented** | gate pastoral |
| POST/GET `/credentials/:id/pdf` (+ `pdf-meta`) | **implemented** | QR opaco, sem CPF |
| GET `/credentials/verify/:opaqueToken` | **implemented** | público + rate limit |

## Auditoria

| Método | Path | Papéis | Status |
|--------|------|--------|--------|
| GET | `/audit-logs?limit=&churchId=&scope=` | SECRETARIA, PASTOR, PLATFORM_ADMIN | **implemented** (`churchId` nullable em scope=organization) |

## Transferências / cartas (F2 completo)

| Método | Path | Status |
|--------|------|--------|
| GET/POST | `/transfers` | **implemented** — mesmo `personId`; destino seed `demoChurchDest02` |
| POST | `/transfers/:id/advance` | **implemented** — APPROVE/REJECT |
| GET/POST | `/letters` | **implemented** — versionadas |
| POST | `/letters/:id/issue\|revoke` | **implemented** |

## F3 — Cuidado e escalas

| Método | Path | Papéis | Status |
|--------|------|--------|--------|
| GET/POST | `/pastoral-cases` | só PASTOR (sigilo; secretaria e PLATFORM_ADMIN 403) | **implemented** |
| GET/POST | `/discipleship/tracks`, `/discipleship/enrollments` | líder/secretaria/pastor | **implemented** |
| GET/POST | `/small-groups` (+ members/meetings) | líder/secretaria/pastor | **implemented** |
| GET/POST | `/ministries`, `/rosters` (+ slots/assignments) | líder/secretaria/pastor | **implemented** |
| GET/PATCH | `/ministries/:id` (+ publish/archive) | líder **só próprio** ministry | **implemented** |

## Portal público — ver handoff dedicado

Detalhe FE: **`docs/handoff-frontend-portal-publico.md`**

## Pendente / precisa aprovação

| Item | Status |
|------|--------|
| URL HML HTTPS pública | **pendente autorização** (`TBD` no runbook) |
| Object storage gerenciado (S3) | arquitetura local pronta; migração cloud pendente |
| OIDC IdP live / MFA hard gate no login | hooks **implemented**; live ainda fora |
| FE consumindo `0.7.2-f2` | ChatGPT / `apps/web` (fora deste PR) |

## Como testar

```bash
npm run build -w @idbrf/shared && npm run build -w @idbrf/db
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run db:seed
npm run build -w @idbrf/api && npm run start:prod -w @idbrf/api
npm run homolog:m1
```
