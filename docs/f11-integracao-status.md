# F1.1 — status do integrador

Base: `previa/rf1-v1` `31d3158c7619bbc4c9d24fd9b94e43ef056ab80e`. PR de homologação #178 permanece DRAFT. `main` não foi alterada. Nenhum deploy, nenhuma migração remota, nenhum acesso a produção, nenhum reset de senha e nenhuma mensagem externa.

Decisão: **NO-GO**.

MFA de login ainda emite JWT quando `mfa.required` está ligado, porque a frente A ainda não entregou PR e o integrador não edita `apps/api/src/auth/**` enquanto ela está em execução. Revogação de sessão ainda não é consultada no guarda JWT. Limite compartilhado existe, mas o caminho padrão continua em memória até `RATE_LIMIT_STORE=shared`. Esses três pontos, sozinhos, impedem GO.

## Frentes

| Frente | Issue | PR | Estado |
| --- | --- | --- | --- |
| A autenticação | #185 | nenhum | BLOCKED — agente em execução, sem PR para incorporar |
| B auditoria | #186 | nenhum | BLOCKED — `AuditWriterService` da frente ainda não chegou; a guarda do integrador já sanitiza `auditLog.create` |
| C observabilidade | #187 | nenhum | BLOCKED — pasta `common/observability` não foi criada por esta branch; `main.ts` já emite `X-Request-Id` |
| D QA independente | #188 | nenhum | BLOCKED — sem matriz adversarial desta fase |
| E integrador | #189 | este PR | parcial, NO-GO |

## O que esta branch entrega

- Tabelas `auth_sessions`, `mfa_challenges`, `security_policies` e `rate_limit_buckets`, coluna `users.authz_version` e colunas nulas `audit_logs.outcome` / `request_id`. A migração não reescreve eventos antigos. `down.sql` reverte só o que ela criou. Nesta verificação o SQL foi aplicado, o trigger bloqueou UPDATE e DELETE, o `down.sql` preservou uma linha antiga de auditoria e a migração foi reaplicada. Isso ocorreu só num Postgres local descartável, apagado ao final. Neon e produção não foram contactados.
- Serviços de sessão, desafio de uso único, versão de política e contador compartilhado. O token opaco não é gravado; persiste o hash. Replay de refresh revoga a família. Desafio consumido não serve de novo.
- `AuditWriterService` e um gancho no cliente Prisma que sanitiza a escrita de auditoria de auth, pessoas, admissões, credenciais, ministérios, escalas, tesouraria, financeiro e CMS sem substituir os serviços dessas pastas. Falha de sanitização da ação rejeita o insert. UPDATE e DELETE de `audit_logs` são recusados no cliente e por trigger.
- `TRUST_PROXY` explícito em produção, IP do limitador sem confiar no primeiro `X-Forwarded-For`, e 429 se o store compartilhado falhar.
- CI com varredura de segredos, testes negativos desses controles e recusa de migração fora de `localhost`. `npm audit` é relatório e não aplica upgrade.

## Personas

Admin técnico, Secretaria, Pastor, Tesouraria, líder, membro, editor e publicador: **BLOCKED**. Não houve E2E autenticado desta fase. Teste de unidade não conta como prova de jornada no navegador.

## Riscos

- Duas instâncias sem `RATE_LIMIT_STORE=shared` não compartilham o limite em memória.
- A guarda de auditoria depende do cliente Prisma estendido. Um caminho que abra outro `PrismaClient` não passa por ela. O trigger ainda impede UPDATE e DELETE.
- Incorporar os PRs A/B/C depois pode exigir ajuste do contrato em `packages/shared/src/security-f11`. Não criar uma segunda migração concorrente.
- O workflow de CI desta branch inclui `previa/rf1-v1`, mas o arquivo que dispara o PR é o da base até este PR entrar nela. Se o GitHub não executar o check, o resultado local permanece a evidência e o item de CI remoto fica BLOCKED.

## Rollback

Não há mudança em produção para desfazer. Se a migração for aplicada mais tarde num banco autorizado, use o backup anterior ou `down.sql` da pasta `20261111193000_f11_session_mfa_policy_ratelimit`. Não rode esse SQL no Neon de QA nem em produção a partir desta branch.
