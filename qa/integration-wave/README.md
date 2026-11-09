# QA da onda de integração

Harness exclusivo desta frente. Lê a `main` do checkout e classifica contratos e a jornada de ficha. Não sobe API, não abre navegador, não lê `.env` e não usa credencial.

Build, lint e este harness não são E2E. Os três FAIL de interface continuam FAIL até a Secretaria entregar a ficha e o QA independente reexecutar a suíte de persona.

## Executar

Na raiz do repositório, com Node 20:

```bash
node --test qa/integration-wave/classify.test.mjs
node qa/integration-wave/classify.mjs
```

O teste que chama `git merge-tree` só roda quando os refs `origin/cursor/*` da onda 0 existem no clone. Sem esses refs, o caso fica ignorado e os demais continuam.
