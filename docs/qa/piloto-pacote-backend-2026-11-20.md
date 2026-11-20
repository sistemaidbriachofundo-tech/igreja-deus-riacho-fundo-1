# Pacote de backend DEV — contratos

Base `feat/rf1-revisao-18-11` em `932c85cd5d5ef0dd2e78cde0153ab7eb24bca151`. A web não entra neste diff. Nada foi aplicado em HML, produção ou DNS. A migração `20261120183000_piloto_pacote_gustavo` é aditiva e só deve rodar no banco de QA/DEV já identificado:

`npm run db:migrate:deploy -w @idbrf/db`

Os valores de DEV ficam em `system_setting_catalog.dev_json`. Publicar uma revisão não reescreve essa coluna. Credenciais de Mercado Pago, BRB e Sicoob permanecem no servidor e fora do PR.

## Acesso

`POST /auth/password/forgot` `{ email }` responde sempre `{ accepted: true, message }`. O link de redefinição continua em `POST /auth/reset-password`, com validade de uma hora e uso único.

`POST /auth/login`, `POST /auth/guest-registration` e `POST /auth/mfa/challenge` aceitam `resumeEventSlug`. A resposta inclui `resume: { eventSlug } | null` quando o slug é de um evento publicado.

`POST /public/events/:slug/registrations` e `POST /member-events/:slug/registrations` exigem sessão de membro ou convidado, também na inscrição gratuita. O catálogo `GET /public/events` permanece público.

`GET/POST/DELETE /admin/access-scopes` grava escopo `MINISTRY | MODULE | GROUP | TRACK` no grant. Sem vínculo, o comportamento atual da congregação permanece. Com vínculo, o líder só alcança o escopo gravado.

## Gestão do sistema

`GET /system-settings/catalog`

`GET /system-settings/effective?key&scopeKind&scopeId&at`

`GET /system-settings/:key/history`

`POST /system-settings/drafts` `{ key, scopeKind?, scopeId?, value, note? }`

`POST /system-settings/revisions/:id/review` `{ expectedUpdatedAt? }`

`POST /system-settings/revisions/:id/publish` `{ effectiveFrom, effectiveUntil?, expectedUpdatedAt? }`

Somente administrador. Estados `DRAFT`, `IN_REVIEW`, `PUBLISHED`. Vigências sobrepostas no mesmo escopo respondem conflito.

## Pastoral e Secretaria

`GET /pastoral/congregation` devolve contagens. Não devolve texto de oração.

`POST /pastoral/prayers` `{ body, responsibleUserId, substituteUserId? }` responde `{ id, status, notified }` sem o texto.

`GET /pastoral/prayers` lista situação e `canReadText`.

`GET /pastoral/prayers/:id` devolve `body` somente ao pastor responsável ou ao substituto.

`GET /pastoral/prayers/bell` devolve `{ notices: [{ id, title: "Há um pedido de oração", createdAt, readAt }] }`.

`POST /persons/:personId/dossier-files` `{ fileName, contentType, contentBase64 }` aceita DOC ou DOCX cuja assinatura confere com o tipo.

`GET /persons/:personId/associations` devolve trilhas, mentor e grupos, com `exclusiveTrack`.

`GET /reports/credential-color/:membershipId` devolve `{ rule, tone: "color" }` com regra `pastoral | lideranca | membro | pendente | inativa`.

`GET /reports/birthday-audiences?ministryId&groupId&mentorPersonId&trackId&exclusiveTrack=1`

`POST /reports/birthday-notices/run` usa `America/Sao_Paulo` e o horário vigente de `notices.birthday.hour_brasilia`. Um aviso por destinatário e dia, com título genérico.

## Escalas e Louvor

A geração de Louvor recebe `LOUVOR_WEEK`: a pessoa não ocupa outro culto de segunda a domingo da mesma escala. A Santa Ceia continua manual (`MANUAL_SUBSTITUTION`). Cada vaga fica com um convite pendente.

`PUT /worship/vocal-profiles/:personId` `{ classification, functions }`

`GET /worship/rosters/:rosterId/export` devolve setor, zona, lado, funções e classificação.

`POST /worship/repertoires` `{ rosterId?, serviceAt, idempotencyKey, items: [{ title, musicalKey, materials? }] }`

`POST /worship/repertoires/:id/authorize` somente para quem está na escala.

`POST /worship/repertoires/:id/schedule` avisa uma vez cada pessoa da escala publicada. Repetir devolve `replay: true`.

## Eventos e Tesouraria

Lote pode usar `paymentProvider: "PIX" | "MERCADO_PAGO"`. Pix direto e conciliação permanecem. Mercado Pago exige conta com `mercadoPagoEnabled`.

`POST /member-events/registrations/:registrationId/mercado-pago/checkout` responde `{ attemptRef, initPoint, mode: "mock" | "live" }`. Sem token, ou com token `mock`, não há chamada externa.

`POST /webhooks/mercado-pago` exige `x-mp-timestamp` e `x-mp-signature` (`HMAC-SHA256` de `timestamp.rawBody` com `MERCADO_PAGO_WEBHOOK_SECRET`). A confirmação só ocorre depois da consulta do pagamento. Há um lançamento por pagamento, com bruto, taxa e líquido na descrição, e um estorno. A repetição do mesmo webhook devolve `replay: true`.

`POST /ledger/bank-adapters/:code/mock-probe` para `BRB`, `SICOOB` ou `MOCK` responde `{ live: false, synced: false }` e não contacta o banco.

## Só para Moças

Evento com `ticketPolicy: "PARTICIPANT"`. A inscrição envia `participants: [{ name, email }]`. Depois da confirmação há um ingresso e um QR por participante, enviados ao e-mail informado e visíveis em Minhas inscrições.

`POST /events/:eventId/scanners` `{ userId }`

`POST /events/:eventId/tickets/scan` `{ code }`

Podem ler: líder do ministério responsável, criador do evento ou usuário autorizado. A leitura confere evento, pagamento e o dia. A repetição devolve `ALREADY_READ` sem segunda presença. QR de outro evento responde que o ingresso não pertence ao evento.
