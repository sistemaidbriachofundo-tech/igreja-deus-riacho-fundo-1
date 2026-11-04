# OpenAPI — contratos F1/F2

| Arquivo | Versão | Uso |
|---|---|---|
| `f2-v0.3.yaml` | `0.3.0-f2` | Contrato BE↔FE vigente (tipos em `@idbrf/shared`) |

O arquivo `f2-v0.2.yaml` do PR #20 **não** deve ser integrado: `API_PATH_PREFIX="/api"` divergia das rotas Nest (`/auth/login`, `/memberships`). Nesta versão o prefixo é vazio (`x-path-prefix: ""`).

Importar no Swagger Editor / Redoc / Insomnia. Base DEV: `http://localhost:3001` (sem `/api`).

Campos `x-implementation`:
- `implemented` — API Nest responde (`/health`, `/auth/*`, `/memberships`, `/credentials/*`, `/admissions*`)
- `proposed` — FE pode mockar; ainda sem backend (`/persons/*`, `/households*`)

Mocks TS: `MOCK_ADMISSION_*` e `MOCK_CREDENTIAL_NOT_ELIGIBLE` em `@idbrf/shared`.

Constante TS: `API_CONTRACT_VERSION` e `joinApiPath()` em `@idbrf/shared`.

Acolhimento e discipulado não fazem parte do checklist. A etapa `documents` é atestação da secretaria — não há upload de arquivo.
