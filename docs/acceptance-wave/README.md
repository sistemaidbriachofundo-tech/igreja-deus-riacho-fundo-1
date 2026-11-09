# Aceitação da onda 0

Relatório da issue #112. A árvore de teste juntou `origin/main` (`194f8f9`) com os PRs draft #101, #102, #103, #104, #106 e #107. O merge local `e513a84` não foi publicado. Este PR só adiciona `docs/acceptance-wave/**` e `qa/acceptance-wave/**`.

Não houve alteração de código de produto, schema, migration, `main`, segredo, mensagem, pagamento ou dado real. O Postgres é local, com o seed fictício já versionado.

## Resultado

**Não está pronto para homologação.**

| Suíte | PASS | FAIL | BLOCKED |
|---|---:|---:|---:|
| Persona #104, execução anterior em 2026-11-09T16:39Z | 86 | 3 | 2 |
| Persona #104 reexecutada nesta árvore (HML local + publicação) | 87 | 2 | 2 |
| Smoke estrito deste harness, Postgres local | 21 | 3 | 5 |

O detalhe está em [matriz.md](./matriz.md), [conflitos.md](./conflitos.md), [fluxo-secretaria.md](./fluxo-secretaria.md) e [timings.md](./timings.md).

## Como repetir

A branch temporária fica só na máquina de teste. Ordem usada, cada uma com `git merge --no-edit`:

1. `7819d22` — #101 RBAC
2. `661ee7b` — #102 Design System
3. `9f7a5c8` — #103 Login
4. `e861389` — #104 QA
5. `939d0a1` — #106 Secretaria
6. `c09c6b4` — #107 mapa

Postgres local `idbrf`, `npm run db:migrate:deploy`, `npm run db:seed` com `NODE_ENV=development`. API em `:3001`. Next de homologação em `:3000` com `NEXT_PUBLIC_HML_ENABLED=true`, `NEXT_PUBLIC_API_URL=http://127.0.0.1:3001` e `NEXT_PUBLIC_BASE_PATH` vazio. Publicação em `:3010`, outro processo, sem `NEXT_PUBLIC_HML_ENABLED`, com `.next` próprio.

Depois, na pasta `qa/acceptance-wave`: `npm install` e `npx playwright test`. A senha sintética vem de `QA_DEMO_PASSWORD` ou da senha de demonstração já escrita no README da raiz. O relatório sai em `reports/run.json` e não grava token.
