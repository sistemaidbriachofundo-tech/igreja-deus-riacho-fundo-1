# Backend do piloto administrativo — DEV

Base de implementação: tag `hml-2026.11.13.1`. Escopo desta entrega: DEV e dados de teste. Não publica DNS, não altera HML/produção e não grava segredo.

## Minha Conta

As rotas exigem a sessão já existente. O servidor usa somente `userId` e `personId` do token. Não há `personId` no corpo.

| Método | Rota | Efeito |
|---|---|---|
| `GET` | `/account/me` | `{ name, email, phone, photoPath, canEditProfilePhoto }` |
| `PATCH` | `/account/me` | `{ phone }` — texto com DDD ou `null`. Devolve o mesmo perfil |
| `POST` | `/account/me/password` | `{ currentPassword, newPassword }` → `204` |
| `PUT` | `/account/me/photo` | multipart no campo `photo` → `204` |
| `GET` | `/account/me/photo` | JPEG privado, `Cache-Control: private, no-store` |

`email` é o e-mail de login. Este PATCH não o altera. A troca continua no convite ou na recuperação, que exigem o link de uso único.

`phone` e `photoPath` vêm `null` quando não existem. `photoPath` é `/account/me/photo`. `canEditProfilePhoto` é verdadeiro só quando a pessoa da sessão está ativa na congregação piloto. Sem esse vínculo, o GET devolve nome, telefone e foto nulos e o PATCH/PUT responde `409` `ACCOUNT_PERSON_UNLINKED`.

O telefone aceito é DDD brasileiro mais 8 dígitos, ou DDD mais celular de 9 dígitos. A resposta guarda `+55` e os dígitos. O PATCH da Secretaria continua recusando `phone` com `PERSON_CONTACT_UNSUPPORTED`.

A senha atual errada responde `400` `ACCOUNT_PASSWORD_CURRENT_INVALID` e entra no limitador já usado no login. A senha nova passa pela política existente. Depois da troca, `authzVersion` sobe e as sessões e desafios pendentes são revogados. O cliente volta ao login.

A foto aceita JPEG, PNG ou WebP até 5 MiB, conferidos pelos bytes. O arquivo é regravado como JPEG sem metadados, no teto de 192 KiB de `person_photos`. A mesma linha alimenta a Ficha 360 e a próxima emissão da carteirinha. Uma foto antiga que já seja JPEG continua sendo lida sem reprocessar.

Erros de domínio usam `{ statusCode, message, error, code }`. Campo fora do contrato cai no `ValidationPipe` (`forbidNonWhitelisted`), no mesmo formato das outras rotas.

## Acesso e e-mail

O convite continua em `POST /admin/access`, só para `PLATFORM_ADMIN` da congregação piloto. A administração da organização pode convidar uma conta `PLATFORM_ADMIN` restrita à organização e congregação do piloto. Um administrador de congregação pode administrar os acessos da congregação e só atribui os demais papéis. A auditoria guarda autor, papel, organização e congregação.

O token segue descartável: só o SHA-256 é gravado, com prazo e uso único. Reenvio antes de um minuto responde conflito. A repetição do mesmo envio bem-sucedido não dispara outra mensagem.

`EMAIL_TRANSPORT=test` usa o transporte em memória e só aceita `@example.test`. `EMAIL_TRANSPORT=smtp` exige, no ambiente autorizado:

| Variável | Valor |
|---|---|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `587` (STARTTLS) ou `465` (TLS) |
| `SMTP_USER` | usuário da caixa |
| `SMTP_PASSWORD` | só no ambiente; nunca no git |
| `SMTP_FROM` | remetente oficial da igreja |
| `SMTP_SEND_ENABLED` | `1` para abrir a conexão |
| `SMTP_ALLOWED_RECIPIENTS` | caixas de teste do DEV, separadas por vírgula |
| `IDBRF_RUNTIME_STAGE` | `qa` na API isolada do DEV |

Sem `SMTP_SEND_ENABLED=1`, o código valida a forma e não envia. Com o envio ligado, a conexão só abre se o estágio for `qa` e o destino for uma caixa listada em `SMTP_ALLOWED_RECIPIENTS`. HML, produção e qualquer outro destinatário — inclusive e-mail sintético e inscrição pública — não saem por SMTP. A lista fica só no ambiente. TLS mínimo 1.2. O corpo da mensagem, inclusive o link com o token, não é persistido. `mail_deliveries` guarda chave, destino, assunto e estado (`PENDING`, `SENT`, `FAILED`).

## Evento pago, presença e tesouraria

O evento continua nascendo em rascunho e a publicação segue a autorização já existente. Inscrição pública, lote, vaga e autorização de responsável permanecem. Com `IDBRF_EVENT_PIX_REQUIRED=true`, a inscrição pública em lote pago exige a conta Pix. O modo simulado anterior permanece disponível para os testes que o usam.

Para Pix, a Tesouraria cria `POST /ledger/receiving-accounts` apontando para uma conta bancária ativa já existente (`ASSET`, código `1.1`). A chave de teste é e-mail `@example.test`, EVP ou telefone de teste. O cadastrador escolhe o id em `GET /events/receiving-accounts` e grava no lote. A lista não devolve a chave.

A inscrição paga devolve o Pix copia-e-cola da conta escolhida e o valor. Não há Mercado Pago. `POST /events/payments/:id/reconcile` com `{ bankCreditConfirmed: true }`, só Tesouraria da congregação, confirma a inscrição e cria um lançamento aprovado de uma vez: débito na conta bancária e crédito na primeira receita ativa. A repetição devolve o mesmo `ledgerEntryId` e não cria outro lançamento. O aviso do QR usa a chave `event-checkin:{registrationId}`.

`POST /events/:eventId/check-in` com `{ checkInCode }` só marca a inscrição daquele evento. Código de outro evento não é encontrado. Repetir devolve o check-in já feito. Membro não opera. O relatório de presença é o que já existe: `GET /events/:eventId/attendance`, o mesmo `GET /reports/participation`.

Despesa com tesoureiro e pastor, saldo, extrato e centro de custo não mudam de regra. Continuam no módulo financeiro já coberto pelos testes de aprovação.

## Migração e reversão

Migração nova: `20261113210000_account_pilot_backend`. Não reescreve migrações aplicadas.

Reversão operacional, com o piloto parado e sem linhas `CONFIRMED_PIX` ainda referenciadas:

```sql
ALTER TABLE "event_payment_intents" DROP CONSTRAINT "event_payment_intents_ledger_entry_id_fkey";
ALTER TABLE "event_payment_intents" DROP CONSTRAINT "event_payment_intents_receiving_account_id_fkey";
DROP INDEX IF EXISTS "event_payment_intents_ledger_entry_id_key";
ALTER TABLE "event_payment_intents" DROP COLUMN "ledger_entry_id", DROP COLUMN "receiving_account_id", DROP COLUMN "pix_txid";
ALTER TABLE "event_lots" DROP CONSTRAINT "event_lots_receiving_account_id_fkey";
ALTER TABLE "event_lots" DROP COLUMN "receiving_account_id";
DROP TABLE "church_receiving_accounts";
DROP TABLE "mail_deliveries";
ALTER TABLE "event_registrations" DROP COLUMN "notification_email";
ALTER TABLE "persons" DROP COLUMN "phone";
```

O valor `CONFIRMED_PIX` do enum fica. O PostgreSQL não remove valor de enum com segurança enquanto a coluna existir; o valor não usado não altera os fluxos antigos.

## Fora desta execução

HML, produção, DNS, credencial SMTP real, mídia/IA, importação de PDF, integração bancária direta, app do membro e patrimônio. Dados reais dependem do aceite da igreja.
