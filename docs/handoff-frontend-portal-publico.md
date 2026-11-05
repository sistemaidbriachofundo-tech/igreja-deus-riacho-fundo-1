# Handoff FE ← BE — Portal público (0.4.0-portal)

**Contrato:** OpenAPI `packages/shared/openapi/f2-v0.2.yaml` · `API_CONTRACT_VERSION = "0.4.0-portal"`  
**Prefixo:** nenhum (`API_PATH_PREFIX = ""`)  
**Base DEV:** `http://localhost:3001`  
**Base HML:** **TBD** — ver `docs/hml-runbook.md`  
**Descoberta:** `GET /meta` devolve `contractVersion` + mapa `endpoints`.

> Backend **não** altera `apps/web`. Sem pastoral/telefone/menor/família/docs na superfície pública.

## Público (sem JWT)

| Método | Path | Status | Notas |
|--------|------|--------|-------|
| GET | `/public/home` | **implemented** | Stub: church + ministries publicados + `featuredEvents`; `contentBlocks: []` (CMS = Frente D) |
| GET | `/public/ministries` | **implemented** | Só `visibility=PUBLIC` + `publishStatus=PUBLISHED` |
| GET | `/public/ministries/:slug` | **implemented** | Perfil + `relatedEvents` + `relatedContent: []` |
| GET | `/public/events` | **implemented** | Só `status=PUBLISHED` (cancelados/arquivados ocultos) |
| GET | `/public/events/:slug` | **implemented** | Detalhe público |

### Ministry público (shape)

```json
{
  "id": "...",
  "name": "Ministério de Jovens",
  "slug": "jovens",
  "description": "...",
  "coverImageUrl": "/images/ministries/jovens-demo.jpg",
  "galleryUrls": ["..."],
  "scheduleText": "...",
  "leadership": [{ "displayName": "Líder Demo Jovens", "roleTitle": "Coordenação" }],
  "participationInfo": "...",
  "publishedAt": "...",
  "relatedEvents": [],
  "relatedContent": []
}
```

### Event público (shape)

```json
{
  "id": "...",
  "ministryId": "...|null",
  "name": "...",
  "slug": "encontro-jovens-demo",
  "description": "...",
  "imageUrl": "...",
  "startsAt": "...",
  "endsAt": null,
  "locationText": "...",
  "featuredOnHome": true
}
```

### Seed slugs

`jovens` · `homens` · `adolescentes` · `mulheres` · `atmosfera` (todos PUBLIC+PUBLISHED)  
Eventos demo: `encontro-jovens-demo`, `culto-familia-demo` (featured).

## Admin (Bearer)

### Ministérios (estende F3)

| Método | Path | Papéis |
|--------|------|--------|
| GET/POST | `/ministries` | create = secretaria/pastor/admin; list = líder vê só o próprio |
| GET/PATCH | `/ministries/:id` | líder **só** próprio (`Grant.ministryId` ou `leaderPersonId`) |
| POST | `/ministries/:id/publish` | PUBLIC + PUBLISHED |
| POST | `/ministries/:id/archive` | ARCHIVED |

### Eventos (núcleo portal — sem inscrição/financeiro/check-in)

| Método | Path | Papéis |
|--------|------|--------|
| GET/POST | `/events` | secretaria/pastor/admin; líder com `ministryId` do próprio |
| GET/PATCH | `/events/:id` | idem |
| POST | `/events/:id/publish\|cancel\|archive` | lifecycle |

Campos: `name`, `slug`, `description`, `imageUrl`, `startsAt`, `endsAt`, `locationText`, `ministryId`, `featuredOnHome`, `status`.

## Auth demo extra

| Email | Senha | Escopo |
|-------|-------|--------|
| `lider.jovens.demo@example.test` | `admin` | `LIDER_MINISTERIO` + `ministryId` = jovens |

## Fora deste handoff (SIDD-30 / Frentes D+E)

- CMS: páginas, notícias, banners, workflow `RASCUNHO→…→PUBLICADO`, histórico
- `GET /public/content/:slug` rico (hoje `relatedContent`/`contentBlocks` vazios)
- `POST /public/volunteer-interests` (Atmosfera) + rate-limit/privacy
- HML URL pública

## Relacionado

- Contratos F2/F3 internos: `docs/handoff-frontend-api-f2.md`
- Diagnóstico: Project Store `docs/portal-hml-diagnostico.md`
