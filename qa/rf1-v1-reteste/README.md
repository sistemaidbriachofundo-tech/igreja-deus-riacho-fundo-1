# Reteste RF1/V1 — SHA 935fd53

Relatório de QA. Não altera tela, API, banco, SSO nem deploy.

```bash
npm test
node src/render-matriz.mjs
```

Os dois comandos usam só Node. Não enviam credencial e não chamam a API HML.

A matriz comparada com a #174 está em `reports/matriz.md`.
As capturas estão em `evidence/`.
`preview-sso-1440.png` e `preview-sso-390.png` mostram o login da Vercel, não a igreja.
`css-fixture-1440.png` é o CSS do commit aberto num arquivo local. Não é o deployment.
