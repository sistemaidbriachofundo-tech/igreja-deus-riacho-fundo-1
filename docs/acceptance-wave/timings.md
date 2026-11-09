# Tempos medidos

Amostra única, Chrome local, Postgres na mesma máquina. Não é meta e não é HML remota. A HML remota permanece BLOCKED.

## Smoke desta execução

| Trecho | Tempo |
|---|---:|
| Login frio, clique até `/app/` | 364 ms |
| Salvar família e receber a confirmação no diálogo | 167 ms |
| Membros → Secretaria → Membros, mesmo documento | 261 ms |

O `runtimeId` não mudou e `performance.getEntriesByType("navigation")` continuou em 1.

## Suíte de persona na mesma árvore

| Trecho | Anterior (#104, 16:39Z) | Esta árvore |
|---|---|---|
| Login frio | 983–1169 ms | 546–557 ms |
| Login quente | 453–554 ms | 391–420 ms |
| Diretório autenticado | 857–1040 ms | 833–914 ms |
| Módulo Secretaria | 470–573 ms | 405–418 ms |
| Gate de publicação em `/login/` | 516 ms | 420 ms |

São amostras de uma corrida. A queda do login frio acompanha cache de compilação do `next dev` e loopback; não autoriza um número de produção.
