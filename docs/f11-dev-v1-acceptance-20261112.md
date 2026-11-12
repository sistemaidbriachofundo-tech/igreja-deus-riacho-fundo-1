# ID Riacho 1 — F1.1 · aceite de segurança da primeira versão DEV
**Data:** 2026-11-12 · **Estado:** NO-GO para dados reais e produção.

## Exatamente o que foi implementado

- Base do DEV: `04b44603ee4e80d42de0ca0a8467cc842a8333c6` de `chatgpt/hml-finance-approvals-access-invite-20261112`; isolado em `chatgpt/f11-mfa-dev-qa-20261112`.
- A antiga autenticação paralela de `HmlPhaseOne` foi eliminada. A área interna reutiliza a página `LoginScreen` para senha, enrollment TOTP, desafio de 6 dígitos e resposta.
- `/auth/me` é revalidado com `fresh: true` antes de permitir mostrar os dados. Sessões recusadas (401) não autorizam o painel.
- Seed fictício ganhou `PUBLICADOR_SITE`, de modo que a matriz de oito personas não se encerre com apenas sete.
- Adicionados testes Vitest para MFA, roteiro E2E Node (somente QA) com validação de JWT, replay, logout e perfis, e workflow GitHub de regressão.

## Evidências confirmadas

- CI GitHub: workflow de verificação isolada em `36b97de` concluído **success**. Inclui typecheck do backend/web, teste do web, testes da autenticação backend e build web com flag HML.
- Preview Vercel `dpl_4qHu2uNjrVSa5YjptaWJ6uCYhLUb` do commit `d0369ed`: estado **READY**, sem promoção/alias da versão compartilhada.
- Inspeção web da prévia: **bloqueada por Vercel SSO**, portanto a tela real de login da igreja não ficou visível no navegador anônimo. Não remover proteção para forçar um PASS.

## Bloqueadores para GO

| Critério | Estado | Ação necessária |
| --- | --- | --- |
| Código de login web com MFA | PASS (CI) | Revisão da PR #200 |
| MFA obrigatório nas contas administrativas | **NÃO COMPROVADO NA API QA** | Configurar `F11_MFA_BLOCKING=true` no ambiente isolado apropriado, sem afetar a HML compartilhada |
| Sessões e desafio persistentes | Código existente; comportamento live não revalidado | `/ready.authState=prisma`, migrations e testes reais |
| Oito personas autenticadas | **NÃO EXECUTADO** | API QA com MFA bloqueante, contas sintéticas e senhas TOTP somente no CI/segredos |
| Editor / Publicador | Seed do publicador preparado, não executado em DB | Aplicar seed autorizado somente QA e validar |
| E2E visual | **BLOCKED** por Vercel SSO | Usar navegador autenticado do QA sem abrir preview ao público |
| Regressões HTTP 401/403, replay, logout, MFA, troca de papel | Testes unitários de backend e roteiro E2E preparados | Exercitar API QA e confirmar matriz |
| Logs e auditoria | Código disponível | Revisar eventos reais sem PII/segredos, falha segura e rate limits |
| Segurança operacional e infraestrutura | Não homologada | Revisar backups, CORS, TLS, WAF, gestão de secrets, storage e rollback |

## Como rodar a validação das oito personas (QA sintética apenas)

O script `qa/security-f11/src/eight-personas-e2e.mjs` tem origem fixa
`https://id-riacho1-api-qa.vercel.app` e recusa execução quando o QA não declara
`mfaBlocking: true` e `authState: prisma`. Necessita:

- `QA_ALLOW_AUTH_TESTS=yes` **somente** em executor autorizado.
- `QA_DEMO_PASSWORD` fornecida por secret do executor, sem commit.
- `QA_F11_TOTP_SECRETS_JSON` somente no CI, para fatores sintéticos preexistentes.
- `QA_ALLOW_MFA_ENROLL=yes` para criar MFA em usuários fictícios, apenas se autorizado.

Ao faltar qualquer requisito, a saída é NO_GO/BLOCKED, nunca PASS.

## Regra de liberação

**Não mesclar em main, não ligar MFA na API HML compartilhada, não modificar bancos de produção, não utilizar dados reais nem liberar V1** até o E2E completo de oito personas e a validação humana de segurança. O preview de MFA está isolado e não altera o sistema público.
