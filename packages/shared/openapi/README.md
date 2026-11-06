# OpenAPI — contratos F1/F2

| Arquivo | Versão | Uso |
|---|---|---|
| `f2-v0.2.yaml` | `0.7.0-das` | Contrato BE↔FE consolidado DAS (portal + PDF/MFA + F4 ledger + F5 canais + F6 multi-igreja) |

## Como o FE consome

1. Gerar cliente OpenAPI a partir de `f2-v0.2.yaml`, **ou**
2. Importar tipos/constantes de `@idbrf/shared` (`packages/shared`).

Constante TS: `API_CONTRACT_VERSION` em `@idbrf/shared`.
