# Proposta de CI para o integrador

Esta frente não altera `.github/workflows/ci.yml`, `package-lock.json` da raiz, schema nem deploy.

Depois que a API HML estiver implantada e os segredos existirem só no ambiente de CI, o job sugerido é:

1. Subir Postgres efêmero com o seed fictício já versionado.
2. Subir a API em `127.0.0.1:3001` e o Next de homologação em `127.0.0.1:3000` com `NEXT_PUBLIC_HML_ENABLED=true`, `NEXT_PUBLIC_API_URL=http://127.0.0.1:3001` e `NEXT_PUBLIC_BASE_PATH` vazio. O build de publicação não pode compartilhar `apps/web/.next`.
3. Na pasta `qa/persona-e2e`, executar `npm ci`, `npm run test:unit` e `npx playwright test tests/hml/phase-g.spec.ts` com `QA_REQUIRE_STACK=1` e `QA_DEMO_PASSWORD` apontando para a senha do seed, sem ecoar o valor no log.
4. Publicar `qa/persona-e2e/reports/matriz.md`, `reports/bugs.md` e `reports/evidence/` como artefato. FAIL de produto deve continuar vermelho. BLOCKED não pode ser convertido em PASS.
5. Na raiz, executar `node --test qa/integration-wave/phase-g-contract.test.mjs`.

Não apontar este job para Pix, banco, dados reais ou para o Pages oficial como se ele já tivesse API.
