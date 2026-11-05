# OpenAPI — contratos F1/F2

| Arquivo | Versão | Uso |
|---|---|---|
| `f2-v0.2.yaml` | `0.3.0-f3` | Contrato BE↔FE F2+F3 (tipos em `@idbrf/shared`) |

Importar no Swagger Editor / Redoc / Insomnia. Base DEV: `http://localhost:3001`.

**Prefixo:** a API Nest **não** usa `/api` — paths são `/auth/login`, `/memberships`, etc.
`API_PATH_PREFIX` em `@idbrf/shared` é `""` (alinhado ao Nest e ao `NEXT_PUBLIC_API_URL`).

Campos `x-implementation`:
- `implemented` — API Nest já responde
- `proposed` — FE pode mockar; backend na fila M1+

Constante TS: `API_CONTRACT_VERSION` em `@idbrf/shared`.

Handoff FE (tabela endpoints + seed + erros): `docs/handoff-frontend-api-f2.md`.
