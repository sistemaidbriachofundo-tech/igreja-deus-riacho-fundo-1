# Igreja de Deus — Riacho Fundo I

Monorepo do sistema de gestão eclesiástica (piloto). Skeleton **F1-SEC**: CI, SonarCloud (opcional) e preview estático no **GitHub Pages** — **sem dados reais**.

| Camada | Stack |
|---|---|
| API | NestJS (`apps/api`) |
| Web | Next.js com `output: 'export'` (`apps/web`) |
| Dados | PostgreSQL + Prisma (`packages/db`) — opção A (local + CI) |
| Shared | Tipos/utilitários (`packages/shared`) |

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
  api/          NestJS — health/hello
  web/          Next.js — página estática de progresso
packages/
  db/           Prisma + migrations + seed fictício
  shared/       Tipos e helpers
.github/
  workflows/ci.yml
docker-compose.yml
```

## O que NÃO vai neste preview

- Dados reais de membros, pastorais ou finanças  
- Secrets / `.env` com credenciais reais  
- API Nest ou Postgres “atrás” do GitHub Pages  

## Licença / uso

Código interno do piloto Igreja de Deus — Riacho Fundo I. Sem dados pessoais reais neste repositório.
