# Igreja de Deus — Riacho Fundo I

Monorepo do sistema de gestão eclesiástica (piloto). Skeleton **F1-SEC** + **F1 IAM / `person_id`**: CI, SonarCloud (opcional), preview estático no **GitHub Pages**, modelo Prisma de pessoas/usuários/papéis e auth JWT na API — **sem dados reais**.

| Camada | Stack |
|---|---|
| API | NestJS (`apps/api`) — health, auth, memberships, credentials |
| Web | Next.js `output: 'export'` — landing `/` + área `/app/*` |
| Dados | PostgreSQL + Prisma (`packages/db`) — opção A (local + CI) |
| Shared | IAM, pilot RF1, token opaco da carteirinha |

Preview Pages **não** hospeda API nem banco. Produção HML/PRD prevista: Hostinger VPS (depois desta pista).

## Pré-requisitos

- Node.js **≥ 20** (recomendado 22)
- Docker + Docker Compose (Postgres/Redis locais)
- npm 10+

## Subir localmente

```bash
# 1. Dependências
cp .env.example .env
npm install

# 2. Banco (opção A)
docker compose up -d
npm run db:generate
npm run db:migrate:deploy
npm run db:seed   # só dados fictícios

# 3. Pacotes compartilhados
npm run build -w @idbrf/shared

# 4. API + Web (terminais separados)
npm run dev:api    # http://localhost:3001  → GET /health
npm run dev:web    # http://localhost:3000  (basePath vazio em .env se quiser raiz)
```

Para o Next em `http://localhost:3000/` sem prefixo de Pages, no `.env`:

```env
NEXT_PUBLIC_BASE_PATH=
```

## Scripts úteis

| Comando | Descrição |
|---|---|
| `npm run lint` | ESLint em todos os workspaces |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm run test` | Jest / Vitest / node:test |
| `npm run build` | Build de todos os workspaces |
| `docker compose up -d` | Postgres + Redis |

## CI (GitHub Actions)

Pipeline em `.github/workflows/ci.yml`:

1. **lint** → **typecheck** → **test** (Postgres efêmero) → **build**
2. **SonarCloud** — soft-fail / skip se `SONAR_TOKEN` não estiver configurado
3. **Deploy Pages** — só em push para `main` (artefato estático de `apps/web/out`)

### Secrets necessários

| Secret | Obrigatório? | Onde |
|---|---|---|
| `SONAR_TOKEN` | Para ativar Sonar | Repo → Settings → Secrets and variables → Actions |

## GitHub Pages

URL (export estático de `apps/web`, deploy pelo job **Deploy GitHub Pages** em `ci.yml`):

`https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/`

**Setup humano (uma vez) — Settings → Pages:**

1. **Source:** GitHub Actions (não “Deploy from a branch”)
2. Confirmar que o workflow **CI** publica o artefato (`apps/web/out`) em push para `main`
3. Após o primeiro deploy bem-sucedido, abrir a URL acima e validar o site

## SonarCloud

1. [sonarcloud.io](https://sonarcloud.io) → login com GitHub → importar este repo  
2. Criar token de análise → secret `SONAR_TOKEN`  
3. (Opcional) Branch protection exigindo o check Sonar quando o gate estiver estável  

Propriedades: `sonar-project.properties`.

## Estrutura

```
apps/
  api/          NestJS — health, auth JWT, memberships, credentials
  web/          Next.js — landing (/) + /app/secretaria + /app/membros/carteirinha
packages/
  db/           Prisma + migrations + seed fictício (RF1 only)
  shared/       person_id, RBAC, pilot slug, opaque QR token
.github/
  workflows/ci.yml
docker-compose.yml
```

## F2 slice — cadastro / secretaria / carteirinha (single church)

Piloto **hard-scoped** a Riacho Fundo I (`PILOT_CHURCH_SLUG=riacho-fundo-1`). Sem UI multi-congregação.

### Modelo novo

| Entidade | Papel |
|---|---|
| `households` | Família leve (opcional no cadastro) |
| `church_memberships` | Vínculo pessoa ↔ congregação piloto |
| `member_credentials` | Carteirinha; `opaque_token` = único conteúdo do QR |

### API (Nest — local / Hostinger; **não** no GitHub Pages)

| Método | Rota | Quem |
|---|---|---|
| `GET` | `/memberships` | `SECRETARIA` (escopo RF1) |
| `POST` | `/memberships` | `SECRETARIA` — cadastra pessoa+membresia |
| `POST` | `/credentials/issue/:membershipId` | `SECRETARIA` |
| `POST` | `/credentials/revoke/:credentialId` | `SECRETARIA` |
| `GET` | `/credentials/me` | `MEMBRO` (própria carteirinha) |
| `GET` | `/credentials/verify/:opaqueToken` | público mínimo (status, sem PII) |

QR **nunca** carrega CPF/telefone/e-mail — só token base64url opaco.

### Web — o que funciona onde

| Superfície | O que roda |
|---|---|
| **GitHub Pages** (`/`) | Landing/status estático + links para `/app/*` |
| **GitHub Pages** (`/app/secretaria`, `/app/membros/carteirinha`) | HTML/JS estático; login **falha** sem API |
| **Local** `dev:api` + `dev:web` | Demo completa (login seed → listar/emitir/ver carteirinha) |
| **Hostinger** (futuro) | Alvo para API+DB dinâmicos atrás do mesmo front |

Contas seed (senha `admin`): `ana.demo@example.test` (secretaria), `bruno.demo@example.test` (membro com carteirinha).

## F1 IAM + `person_id`

Fundação de identidade e autorização **no servidor** (sem módulos de produto: WhatsApp, finanças, pastoral, etc.).

### Modelo (Prisma)

| Entidade | Papel |
|---|---|
| `organizations` / `churches` | Escopo multi-congregação (já existiam; relações estendidas) |
| `persons` | Pessoa única — a PK `id` **é** o `person_id` estável (DAS) |
| `users` | Conta de login, **1:1** com `person_id` |
| `roles` / `grants` | RBAC + escopo opcional `organization_id` / `church_id` (ABAC mínimo) |
| `audit_logs` | Trilha mínima (sem política completa ainda) |

### Estratégia de autenticação (JWT)

- **Agora (skeleton):** JWT **HMAC-SHA256** emitido pela API (`POST /auth/login`), validado em `JwtAuthGuard` global.
- Claims mínimas: `sub` (userId), `personId`, `email`, `grants[]`.
- Rotas públicas: `@Public()` (ex.: `GET /health`, `POST /auth/login`).
- **Não** usamos cookie/session store neste PR.
- **Depois (decisão aberta):** OIDC + MFA para privilegiados — o módulo `auth` está preparado para trocar o emissor de tokens sem reescrever guards RBAC/escopo.
- Hash de senha no seed: `sha256:…` **somente demo**. Alvo DAS: **Argon2id** antes de HML com contas reais.

### Autorização

- `RolesGuard` — stub RBAC via `@Roles(...)`.
- `ScopeGuard` — stub de escopo via `@RequireScope(...)` + helpers `hasAccess` / `grantMatchesScope` em `@idbrf/shared`.
- Smoke: `GET /auth/me` (JWT) e `GET /auth/rbac-smoke` (exige `SECRETARIA`).

### Seed fictício

```bash
npm run db:seed
```

Cria org/igreja demo, papéis base, duas pessoas (`demoPersonRiacho01`, `demoPersonMembro01`) e usuários `ana.demo@example.test` / `bruno.demo@example.test` (senha demo: `admin`). **Proibido** colar PII real.

### O que o IAM sozinho não inclui (ver slice F2 acima)

- WhatsApp, finanças, pastoral, escalas  
- OIDC/MFA, Argon2id de produção, política completa de auditoria  
- Multi-congregação / multi-org UI  

## O que NÃO vai neste preview

- Dados reais de membros, pastorais ou finanças  
- Secrets / `.env` com credenciais reais  
- API Nest ou Postgres “atrás” do GitHub Pages  

## Licença / uso

Código interno do piloto Igreja de Deus — Riacho Fundo I. Sem dados pessoais reais neste repositório.
