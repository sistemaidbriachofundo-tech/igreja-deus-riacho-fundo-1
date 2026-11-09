# Harness de aceitação da onda 0

Smoke de navegador e relatório da issue #112. Não altera telas, API, schema nem o workflow de CI.

## Executar

Com API em `:3001` e Next de homologação em `:3000` (`NEXT_PUBLIC_HML_ENABLED=true`, `NEXT_PUBLIC_BASE_PATH` vazio):

```bash
npm install
QA_HML_BASE_URL=http://127.0.0.1:3000 QA_API_BASE_URL=http://127.0.0.1:3001 npx playwright test
npm run test:unit
```

`QA_DEMO_PASSWORD` é a senha sintética do seed. Se ficar vazia, o script usa a senha de demonstração já documentada no README da raiz. Token e senha não entram em `reports/`.

O `reports/run.json` desta árvore registra 21 PASS, 3 FAIL e 5 BLOCKED. `productApproved` é false. O teste unitário recusa um relatório que se declare aprovado enquanto houver FAIL ou BLOCKED.

A suíte de persona do #104 continua em `qa/persona-e2e` e não é editada aqui. As matrizes reexecutadas estão em `reports/persona-hml-matriz.json` e `reports/persona-public-matriz.json`.
