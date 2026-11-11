# Ameaças confirmadas no fonte

Cada item abaixo foi lido no SHA candidato. O passo seguinte é correção nas frentes A, B, C e E, com reteste desta suíte. Esta frente não altera esses módulos.

## F11-MFA-01 (P0)

Login privilegiado não pode emitir JWT pleno antes do TOTP

POST /auth/login chama issueTokenPair mesmo quando o hint diz challengeRequired.

Evidência: `apps/api/src/auth/auth.service.ts:128`.

## F11-MFA-02 (P0)

Refresh e troca de congregação herdam a sessão sem novo desafio MFA

refresh() e switchChurch() reemitem o par de tokens sem consultar fator TOTP.

Evidência: `apps/api/src/auth/auth.service.ts:169`.

## F11-MFA-03 (P1)

Editor e publicador conseguem iniciar o próprio TOTP

MfaController lista papéis autenticados e omite EDITOR_SITE e PUBLICADOR_SITE. O login dessas contas continua a emitir JWT. Quando a F1.1 exigir MFA, o reteste tem de provar que elas não ficam sem caminho de cadastro nem entram privilegiadas sem desafio.

Evidência: `apps/api/src/auth/mfa/mfa.controller.ts:40`.

## F11-MFA-04 (P1)

Enrollment não devolve segredo TOTP depois que a senha já abriu sessão

enrollTotp devolve otpauthUri e o segredo no corpo. Combinado com o JWT do login, a senha basta para retirar o fator.

Evidência: `apps/api/src/auth/mfa/mfa.service.ts:109`.

## F11-MFA-05 (P1)

Produção exige chave dedicada de cifragem do TOTP

Sem MFA_ENCRYPTION_KEY e sem JWT_SECRET, a cifragem cai num literal de desenvolvimento. Produção exige JWT_SECRET, mas não exige chave MFA separada.

Evidência: `apps/api/src/auth/mfa/mfa-crypto.util.ts:39`.

## F11-JWT-01 (P0)

O guard reconsulta status, revogação e grants a cada pedido

verifyAccessToken aceita os grants do payload. JwtAuthGuard não consulta o banco. Um token já emitido sobrevive a desativação, logout inexistente e troca de papel até exp.

Evidência: `apps/api/src/auth/auth.service.ts:239`.

## F11-JWT-02 (P0)

Existe logout que invalida a sessão no servidor

AuthController expõe login, me, refresh e switch-church. Não há logout nem logout-all.

Evidência: `apps/api/src/auth/auth.controller.ts:25`.

## F11-ENUM-01 (P2)

A verificação de senha não cria oráculo de tempo por existência de conta

Usuário inexistente responde antes do Argon2. A mensagem é igual; o tempo não é.

Evidência: `apps/api/src/auth/auth.service.ts:76`.

## F11-RATE-01 (P0)

O limite de login não confia no primeiro X-Forwarded-For enviado pelo cliente

clientIp usa o primeiro salto do cabeçalho, sem lista de proxies confiáveis. Um cliente pode variar o valor e ganhar um balde novo.

Evidência: `apps/api/src/common/simple-rate-limit.middleware.ts:12`.

## F11-RATE-02 (P1)

O limite é compartilhado entre instâncias e cobre confirmação MFA, refresh e troca de congregação

O contador é um Map no processo. As rotas limitadas são login, verificação de carteirinha, voluntariado, inscrição pública, webhook mock e chat público. MFA, refresh e switch-church ficam de fora. Em mais de uma instância o limite não se soma.

Evidência: `apps/api/src/app.module.ts:85`.

## F11-CORS-01 (P1)

CORS de ambiente publicado é uma lista explícita, nunca reflexo de qualquer origem

Sem CORS_ORIGIN, a API reflete qualquer origem. A exigência da lista só dispara quando NODE_ENV é production. Homologação com outro NODE_ENV fica aberta. Não há cookie de sessão; o impacto é browser chamando a API a partir de outra origem com um Bearer que a página já tenha.

Evidência: `apps/api/src/main.ts:33`.

## F11-HDR-02 (P2)

A aplicação envia Content-Security-Policy

O bootstrap não define CSP. O portal estático precisa da política no host que entrega o HTML. Isso não foi visto no deploy.

Evidência: `apps/api/src/main.ts:56`.

## F11-UP-01 (P1)

Comprovante financeiro confere a assinatura do arquivo, não só o mimetype declarado

O anexo de lançamento aceita PDF, JPEG ou PNG pelo mimetype do cliente, com teto de 5 MiB e nome saneado. Não há conferência dos bytes. A mídia do site confere assinatura e recusa o pedido quando o tipo declarado diverge.

Evidência: `apps/api/src/finance/finance.service.ts:1574`.

## F11-QR-02 (P1)

Token de QR malformado responde 400, não erro interno

assertOpaqueCredentialPayload lança Error comum. A rota pública não converte isso em 400. O filtro do Nest responde 500. A homologação observada devolveu 500 para um token curto sintético; isso descreve a origem consultada e o mesmo padrão está no fonte candidato.

Evidência: `packages/shared/src/credential-token.ts:75`.

## F11-WH-01 (P1)

Webhook de pagamento mock não usa segredo fixo quando a variável falta

A rota é pública e exige HMAC e Idempotency-Key. Se EVENT_PAYMENT_WEBHOOK_SECRET não estiver definida, o código volta a um segredo de demonstração embutido. Isso não pode existir numa instância publicada.

Evidência: `apps/api/src/events/event-registrations.service.ts:1626`.

## F11-IDEM-01 (P1)

Reenvio de lançamento não duplica o efeito

POST do ledger não recebe chave de idempotência. O caixa em treasury/treasury.service.ts consulta um audit_log e só depois grava: duas requisições simultâneas com a mesma chave podem criar dois lançamentos. Não há restrição única no banco para essa chave.

Evidência: `apps/api/src/finance/finance.controller.ts:360`.

## F11-SCALE-01 (P1)

Atribuição de escala não duplica a mesma pessoa no mesmo slot

roster_assignments indexa slot e pessoa, sem unicidade. O serviço procura conflitos antes de gravar; a corrida de dois envios não está fechada no banco.

Evidência: `packages/db/prisma/schema.prisma:1344`.

## F11-AUD-01 (P1)

Metadado sensível é recusado na escrita, não só mascarado na leitura

A redação acontece em listRecent, sem olhar o papel de quem lê. Os escritores gravam o JSON que receberam. Segredo no metadado permanece na linha até alguém ler pela API.

Evidência: `apps/api/src/audit/audit-metadata.redactor.ts:2`.

## F11-AUD-02 (P1)

audit_logs não é atualizável pelo modelo usado pela aplicação

O modelo não tem updatedAt. Também não há REVOKE de UPDATE/DELETE nem gatilho append-only neste schema. A trilha ainda depende da disciplina do client Prisma.

Evidência: `packages/db/prisma/schema.prisma:434`.

## F11-GUARD-01 (P1)

Líder sem ministryId no grant não é aceito em rota de outro ministério

AccessPolicyGuard passa unknownLeader allow. Na política compartilhada, grant de líder sem ministryId cobre o ministryId pedido. O serviço de vínculo formal pode apertar depois; a borda HTTP deste guard não aperta.

Evidência: `apps/api/src/auth/guards/access-policy.guard.ts:88`.
