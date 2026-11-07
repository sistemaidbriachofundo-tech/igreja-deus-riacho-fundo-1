# OpenAPI — contratos F1/F2

| Arquivo | Versão | Uso |
|---|---|---|
| `f2-v0.2.yaml` | `0.7.4-rf022` | Contrato BE↔FE — Etapa 3 + RF-014/015 + RF-022 hospedagem/menor |

## Como o FE consome

1. Gerar cliente OpenAPI a partir de `f2-v0.2.yaml`, **ou**
2. Importar tipos/constantes de `@idbrf/shared` (`packages/shared`).

Constante TS: `API_CONTRACT_VERSION` em `@idbrf/shared`.
