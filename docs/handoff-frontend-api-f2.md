# Handoff FE ← BE — contratos F2 (ChatGPT / `apps/web`)

**Contrato:** OpenAPI `packages/shared/openapi/f2-v0.2.yaml` · versão TS `API_CONTRACT_VERSION = "0.2.0-f2"`  
**Prefixo:** nenhum (`API_PATH_PREFIX = ""`) — paths na raiz Nest.  
**Base DEV local:** `http://localhost:3001`  
**Base HML (quando provisionada):** definir `NEXT_PUBLIC_API_URL` apontando para a API HML (HTTPS). Pages estático **não** embute API.

> Backend **não** altera `apps/web`. FE consome este contrato.

## Auth

| Método | Path | Auth | Papéis | Status |
|--------|------|------|--------|--------|
| POST | `/auth/login` | público | — | **implemented** |
| GET | `/auth/me` | Bearer | qualquer autenticado | **implemented** |
| GET | `/auth/rbac-smoke` | Bearer | SECRETARIA | **implemented** (dev smoke) |

**Login body:** `{ "email": string, "password": string }`  
**Login 201:** `{ accessToken, tokenType: "Bearer", expiresInSeconds, user: { userId, personId, email, grants[] } }`  
**Header:** `Authorization: Bearer <accessToken>`

### Seed fictício (nunca dados reais)

| Email | Senha | Papel |
|-------|-------|-------|
| `ana.demo@example.test` | `admin` | SECRETARIA |
| `pastor.demo@example.test` | `admin` | PASTOR |
| `bruno.demo@example.test` | `admin` | MEMBRO |

## Admissão (M1)

| Método | Path | Papéis | Status |
|--------|------|--------|--------|
| GET | `/admissions` | SECRETARIA, PASTOR, PLATFORM_ADMIN | **implemented** |
| GET | `/admissions/:admissionId` | idem | **implemented** |
| POST | `/admissions` | SECRETARIA, PLATFORM_ADMIN | **implemented** |
| POST | `/admissions/:admissionId/advance` | SECRETARIA e/ou PASTOR conforme etapa | **implemented** |

**Fluxo:** `modality → documents → secretaria → pastor`  
**Resposta inclui:** `checklist`, `credentialEligible` (true só com status `APPROVED`).

### Erros esperados (negócio)

| HTTP | `code` | Quando |
|------|--------|--------|
| 401 | — | JWT ausente/inválido |
| 403 | — / `ADMISSION_ROLE_REQUIRED` | papel inadequado |
| 404 | — | protocolo/pessoa inexistente no piloto |
| 409 | `ADMISSION_STEP_LOCKED` | etapa fora de ordem |
| 409 | `ADMISSION_ALREADY_OPEN` | já há protocolo aberto |
| 409 | `ADMISSION_CLOSED` | APPROVED/REJECTED/CANCELLED |
| 409 | `MEMBERSHIP_ALREADY_ACTIVE` | create com membership ACTIVE |
| 400 | — | body inválido / modality ausente / decision ausente |
| 429 | `RATE_LIMITED` | excesso em login/verify |

## Pessoas / famílias

| Método | Path | Papéis | Status |
|--------|------|--------|--------|
| GET | `/persons/search?q=&limit=` | SECRETARIA, PASTOR, PLATFORM_ADMIN | **implemented** |
| GET | `/persons/:personId` | idem | **implemented** |
| POST | `/households` | SECRETARIA, PLATFORM_ADMIN | **implemented** |
| GET | `/households/:householdId` | SECRETARIA, PLATFORM_ADMIN | **implemented** |

- `autoMergeForbidden: true` sempre na busca (anti-merge automático).
- Menor sem `legalGuardianPersonId` **não** vincula a família / bloqueia admissão.

## Membresia (legado — preferir admissão)

| Método | Path | Status | Nota |
|--------|------|--------|------|
| GET | `/memberships` | **implemented** | listagem secretaria |
| POST | `/memberships` | **implemented** | legado; FE deve preferir `POST /admissions` |

## Carteirinha

| Método | Path | Auth | Status |
|--------|------|------|--------|
| GET | `/credentials/me` | Bearer (MEMBRO+) | **implemented** |
| POST | `/credentials/issue/:membershipId` | SECRETARIA | **implemented** — exige admissão APPROVED |
| POST | `/credentials/reissue/:membershipId` | SECRETARIA | **implemented** |
| POST | `/credentials/revoke/:credentialId` | SECRETARIA | **implemented** |
| GET | `/credentials/verify/:opaqueToken` | **público** | **implemented** — só status/nome/igreja; rate-limited |

**Gate:** sem `credentialEligible` / admissão APPROVED → `409 CREDENTIAL_NOT_ELIGIBLE`.  
**QR:** apenas `qrPayload` opaco — sem CPF/telefone/e-mail.

## Pendente / proposed (não bloquear FE mock)

- OIDC / MFA
- Object storage de documentos da admissão
- Transferência entre igrejas
- Rate limit distribuído (Redis) — hoje in-memory DEV/HML
- Multi-congregação (piloto = RF1 only)

## Como testar a API

```bash
docker compose up -d postgres   # ou Postgres local
cp .env.example .env
npm ci && npm run build -w @idbrf/shared && npm run build -w @idbrf/db
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run db:seed
npm run build -w @idbrf/api && npm run start:prod -w @idbrf/api
node scripts/homolog-m1-admission.mjs
```

OpenAPI completo: `packages/shared/openapi/f2-v0.2.yaml`.
