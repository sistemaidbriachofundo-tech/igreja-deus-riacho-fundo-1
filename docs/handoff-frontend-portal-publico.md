# Handoff FE ← BE — Portal público (0.5.0-portal)

**Contrato:** OpenAPI `packages/shared/openapi/f2-v0.2.yaml` · `API_CONTRACT_VERSION = "0.5.0-portal"`  
**Prefixo:** nenhum (`API_PATH_PREFIX = ""`)  
**Base DEV:** `http://localhost:3001` · **HML:** TBD  
**Descoberta:** `GET /meta`

> Backend **não** altera `apps/web`. Sem pastoral/telefone/menor/família/docs na superfície pública (exceto email no POST de interesse, que **não é ecoado**).

## Critérios públicos (1–9)

| # | Endpoint | Status |
|---|----------|--------|
| 1 | `GET /public/home` | **ok** — ministries + featuredEvents + `contentBlocks` + `banners` |
| 2 | `GET /public/ministries` | **ok** |
| 3 | `GET /public/ministries/:slug` | **ok** — + relatedEvents + relatedContent |
| 4 | `GET /public/events` | **ok** |
| 5 | `GET /public/events/:slug` | **ok** |
| 6 | `GET /public/content/:slug` | **ok** — só `PUBLICADO` |
| 7 | `POST /public/volunteer-interests` | **ok** — rate-limit; ack sem email |
| 8 | Admin estendido | **ok** — ministries/events/cms/volunteer-interests |
| 9 | OpenAPI + handoff | **ok** — este doc + YAML |

## CMS (Frente D)

**Kinds:** `HOME_BLOCK` · `PAGE` · `NEWS` · `BANNER` · `MINISTRY_CONTENT`  
**Workflow:** `RASCUNHO → REVISAO → APROVADO → PUBLICADO → ARQUIVADO` (transições validadas; histórico em `revisions[]`)

| Método | Path |
|--------|------|
| GET/POST | `/cms/contents` |
| GET/PATCH | `/cms/contents/:id` |
| POST | `/cms/contents/:id/advance` `{ toStatus }` |

Público só `status=PUBLICADO`. Líder só `MINISTRY_CONTENT` do próprio ministry.

## Atmosfera / voluntariado (Frente E)

**Jornada:** `INTERESSE → AVALIACAO → APROVACAO → EQUIPE → DISPONIBILIDADE → ESCALA`  
Reusa `Person` (obrigatório a partir de EQUIPE) e `Roster` (obrigatório em ESCALA). Sem import Kairos.

| Método | Path | Notas |
|--------|------|-------|
| POST | `/public/volunteer-interests` | body: displayName, email, phone?, message?, ministrySlug? (default `atmosfera`) → `{ received, id, stage, ministrySlug }` |
| GET | `/volunteer-interests` | admin; líder filtra próprio |
| GET/PATCH | `/volunteer-interests/:id` | advance stage/status/personId/rosterId |

## Seed útil

- Ministries: `jovens|homens|adolescentes|mulheres|atmosfera`
- CMS: `home-boas-vindas`, `banner-culto-familia`, `aviso-voluntariado-atmosfera`, `sobre-nos`, `jovens-trilhas`
- Líder jovens: `lider.jovens.demo@example.test` / `admin`

## Fora de escopo / não mergear

- HML URL pública, merge produção, IA/canais WhatsApp, financeiro/inscrição eventos
