# OpenAPI — contratos F1/F2

| Arquivo | Versão | Uso |
|---|---|---|
| `f2-v0.2.yaml` | `0.2.0-f2` | Contrato BE↔FE (tipos em `@idbrf/shared`) |

Importar no Swagger Editor / Redoc / Insomnia. Base DEV: `http://localhost:3001`.

Campos `x-implementation`:
- `implemented` — API Nest já responde
- `proposed` — FE pode mockar; backend na fila M1+

Constante TS: `API_CONTRACT_VERSION` em `@idbrf/shared`.
