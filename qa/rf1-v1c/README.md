# QA RF1/V1-C

Auditoria independente da issue #171. A suíte lê o GitHub Pages oficial e a API HML. Não altera tela, API, banco, contrato, workflow nem faz deploy.

A matriz antiga da #153 descreve o SHA `3c7375c`. Esta suíte só vale para a baseline `6c43aea96ad3fe24ec1ed2c09f717963fb289c62`, conferida em `/release.json`.

## Como rodar

Na pasta `qa/rf1-v1c`, com Chrome instalado:

```bash
npm install
npm run test:unit
QA_RUN_EXTERNAL=1 npm run test:live
```

`QA_PAGES_URL` aponta para a prévia quando `id-riacho1-web-hml` estiver READY. `QA_DEMO_PASSWORD` troca a senha do seed local. Sem essa variável, há uma tentativa por conta sintética com a senha documentada do seed de desenvolvimento. A senha não entra no relatório.

Os relatórios versionados ficam em `docs/qa/rf1-v1c/` e `reports/`. As capturas ficam em `evidence/`.
