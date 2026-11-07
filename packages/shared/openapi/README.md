# OpenAPI — contratos F1/F2

| Arquivo | Versão | Uso |
|---|---|---|
| `f2-v0.2.yaml` | `0.7.2-f2` | Contrato BE↔FE consolidado DAS + Vivi + fechamento F2 (login audit / cancel / docs delete) |

## Como o FE consome

1. Gerar cliente OpenAPI a partir de `f2-v0.2.yaml`, **ou**
2. Importar tipos/constantes de `@idbrf/shared` (`packages/shared`).

Constante TS: `API_CONTRACT_VERSION` em `@idbrf/shared`.
