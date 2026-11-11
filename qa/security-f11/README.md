# QA F1.1-D

Suíte adversarial independente. Ela lê o fonte da candidata, classifica o `npm audit` e, só com `--live-hml`, faz pedidos curtos e sem efeito na API de homologação já usada pelo QA v3.

Não altera API, banco, workflow, senha nem envio de mensagem.

```bash
node --test src/static-scan.test.mjs src/http-matrix.test.mjs src/cve-classify.test.mjs
node src/run.mjs
node src/run.mjs --live-hml
```

Os relatórios saem em `docs/qa/security-f11/` e `reports/`. PASS estático não é prova de deploy. O HTTP só prova o commit candidato quando `/meta` devolve esse SHA.

A origem ao vivo está limitada a `https://id-riacho1-api-hml.vercel.app` e a loopback. Qualquer outro host é recusado. Não há laço de senha, upload nem chat.
