# QA v3 — frente I (#153)

Auditoria externa do **Sistema da Igreja de Deus — Riacho Fundo I**. Eklesia não entra nesta prova. A suíte só lê o GitHub Pages oficial e a API HML. Não altera produto, schema, seed, workflow nem faz deploy.

## O que é executado

- Catálogo SG-T01..SG-T26, UX-01..UX-06 e UX-V01..UX-V18.
- Oito personas sintéticas, uma tentativa de login cada, sem reset de senha.
- Rotas internas sem sessão, clique em carteirinha, membros, Ministérios, menu móvel e saída.
- Larguras 320, 360, 390, 768, 1024, 1440 e 1920, mais zoom 200%.
- 401 anônimo e ausência de envio externo. 404 ou 501 visível vira FAIL.

PASS só depois da execução. Sem a senha HML, a jornada autenticada fica BLOCKED. A senha não é gravada no relatório.

## Como rodar

Na pasta `qa-v3`, com Chrome instalado:

```bash
npm install
npm run test:unit
QA_RUN_EXTERNAL=1 npx playwright test
```

`QA_DEMO_PASSWORD` troca a senha do seed local quando o integrador J a fornecer. Sem essa variável, a suíte tenta uma vez a senha documentada do seed de desenvolvimento.

Os relatórios saem em `reports/` e as capturas em `evidence/`. A decisão vai para J na issue #154. Esta frente não aprova a release enquanto houver FAIL P0/P1 ou BLOCKED crítico.
