# F1.1 — status do integrador

Base de código: HEAD da API QA `qa/dashboard-address-20261111` `19c7c33dabca8928fffbea981ea2edb38adea1b6`, mais as frentes A #193 `6e591c98`, B #192 `f03bdd0`, C #194 `b57f7f9`, D #190 `e7281e5` e E #191 `b5033ff`. `main`, o PR #178 e os branches ativos do Work não recebem merge. Produção, API HML, GitHub Pages e Kairos ficam de fora.

## Contrato de login para o Work

O painel atual lê `accessToken` em `POST /auth/login`. Por isso `F11_MFA_BLOCKING` fica desligado na API QA consumida por esse painel. Com a flag desligada:

- papel privilegiado ainda recebe `accessToken`, `tokenType` e `user`;
- a sessão é gravada no Postgres quando a API roda na Vercel (`VERCEL=1`) ou com `AUTH_STATE_STORE=prisma`;
- logout e o guarda JWT consultam essa sessão. Token sem `sid`, sessão revogada ou versão vencida responde 401;
- `users.mfa_required = true` continua devolvendo desafio, sem JWT, mesmo com a flag desligada.

Com `F11_MFA_BLOCKING=true`, ou com `IDBRF_RUNTIME_STAGE=production` (a produção recusa subir sem a flag), Secretaria, Pastor, Tesouraria, líder, editor, publicador e qualquer papel que não seja só `MEMBRO` recebem:

```json
{
  "mfa": {
    "enabled": false,
    "required": true,
    "challengeRequired": false,
    "enrollmentRequired": true,
    "challengeId": "<opaco>",
    "expiresInSeconds": 600,
    "oidcLive": false
  }
}
```

Não há `accessToken` nesse corpo. O enrollment usa o `challengeId` em `POST /auth/mfa/enroll` e a confirmação em `POST /auth/mfa/enroll/confirm`. O desafio TOTP de quem já tem fator ativo usa `POST /auth/mfa/challenge`. O desafio é de uso único. Produção não aceita `F11_MFA_BLOCKING=false`.

## Persistência

A migração `20261111193000` cria sessão, desafio, política e limite. A migração `20261111213000` acrescenta `authz_fingerprint`, `mfa_satisfied`, `challenge_kind`, `reads` e `auth_attempt_windows` para o runtime da frente A usar as tabelas da frente E. O sid e o desafio em claro não são gravados. `down.sql` da segunda pasta roda antes do da primeira. Nenhuma das duas reescreve `audit_logs`.

Ensaio feito só num Postgres local descartável, depois apagado. As 25 migrações aplicaram, o trigger bloqueou UPDATE em `audit_logs`, o insert do runtime de sessão e desafio passou, o `down.sql` da alinhamento preservou a linha antiga e a migração foi reaplicada. O Neon `br-twilight-bonus-b6moawk7` não foi contactado: este ambiente não tem a URL dessa branch nem token da Vercel.

Na Vercel o limite HTTP usa `rate_limit_buckets`. `RATE_LIMIT_STORE=memory` impede a subida. Falha do store responde 429.

## Auditoria e observabilidade

`auditLog.create` passa pela guarda que sanitiza antes do insert e recusa update/delete. O `AuditWriterService` de `platform-security` está disponível para a mesma transação. Logs JSON, correlação e métricas sobem com `OBSERVABILITY_INSTALL_GLOBALS=1`, que a Vercel liga sozinha. `/metrics` sem token longo responde 404. `/ready` confirma o Postgres e informa `commit`, `authState` e `mfaBlocking`. O 503 de banco continua só com `status`, `service` e `database`.

## Personas

Prova de navegador das oito personas depende do deploy QA e de usuários sintéticos já existentes. Teste de unidade não substitui essa jornada. O relatório do PR registra PASS, FAIL ou BLOCKED por persona.
