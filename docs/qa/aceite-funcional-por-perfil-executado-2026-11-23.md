# Aceite funcional por perfil — execução 2026-11-23

Issue [#309](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/issues/309). Candidata `chatgpt/dev-prehml-final-gates-20261123` no SHA `5f32bb3fd4006e8f3276721210e4664e5a59b6d3`.

Nenhuma escrita foi feita em HML, produção, DNS ou na branch Neon `br-jolly-darkness-b6f5mzsy`. A branch QA `br-twilight-bonus-b6moawk7` também não foi aberta: este ambiente não tem a URL desse banco. Não houve pagamento real, SMTP nem WhatsApp.

## O que é PASS e o que não é

| Superfície | Resultado | Prova |
|---|---|---|
| Frontend DEV `id-riacho1-web-hml-git-0d6b26-…vercel.app` | **HOSTED BLOCKED** | HTTP 302 para `vercel.com/sso-api`. Capturas `hosted-sso-1440.png` e `hosted-sso-390.png`. Nenhum login hospedado foi inventado. |
| API QA `https://id-riacho1-api-qa.vercel.app` | **HOSTED BLOCKED** para as nove jornadas autenticadas | `GET /ready` 200, commit `5f32bb3fd400`, `database=ok`, `authState=prisma`, `mfaBlocking=true`. Login com a senha sintética documentada do seed: **401 `INVALID_CREDENTIALS`** nas nove contas. Não há `QA_DEMO_PASSWORD`, segredo TOTP nem URL Neon neste runner. `GET /ledger/accounts` e `GET /audit-logs` anônimos: 401. |
| API + Postgres locais, só em loopback | **LOCAL**, não substitui o E2E hospedado | Banco `localhost:5432/idbrf`, 56 migrações do SHA, seed fictício. `F11_MFA_BLOCKING` desligado, então o MFA obrigatório da QA **não foi exercido**. Sessão local em memória (`authState=memory`). E-mail em preview, sem SMTP. |

O painel local só renderiza com `NEXT_PUBLIC_HML_ENABLED=true`. Esse flag liga a área interna no Next de desenvolvimento. O processo não apontou para a API nem para o banco de HML.

Evidência bruta: `docs/qa/evidence/aceite-funcional-2026-11-23.json`. O campo `summary` desse JSON chegou a misturar status de negócio com o veredito; a matriz abaixo é a leitura corrigida dos HTTP e das consultas ao Postgres local. Harness: `scripts/qa/aceite-personas-20261123.mjs` (recusa qualquer API que não seja loopback).

Prefixo dos registros: `QA-PERSONA-20261123`. Igreja do piloto: `riacho-fundo-1`. Segunda congregação do seed, usada só na checagem de escopo: `riacho-fundo-2-demo`.

## Matriz

| Persona | Hospedado | Local | Jornada comprovada no loopback | Antes → depois | HTTP | DB local |
|---|---|---|---|---|---|---|
| PLATFORM_ADMIN | BLOCKED | PASS funcional; MFA não exercido | Entrou com a senha do seed. Catálogo da Gestão do Sistema. Rascunho, revisão e publicação de `events.agenda.keep_days_after_end`. Módulo na Atmosfera criado e renomeado. Regra do módulo salva. Gestão de Acessos. Membro recebe 403 em `/audit-logs`. Sem sessão, `/auth/me` 401. Simulação e gravação do mês 2026-12 da Atmosfera. | Regra vigente `0` → publicada `7`. Módulo ausente → `QA-PERSONA-20261123 modulo renomeado`, `minIntervalDays=7`. Escalas `0` → `91` rascunhos. | 200/201 nas ações; 403 e 401 nas recusas | `system_setting_revisions` PUBLISHED `7`. `ministry_roster_modules.rules`. `rosters` 91 DRAFT. Auditoria cresceu. |
| PASTOR | BLOCKED | PASS | Dashboard pastoral, aniversários e admissões. Ledger 403. Aprovou a despesa sintética e rejeitou a segunda. Ordem de culto com item «Equipe de Mídia», reabriu, exportou PDF `%PDF-1.3`, aprovou e publicou. | Despesa `PENDING_APPROVAL` → `APPROVED`. Segunda despesa → `REJECTED`. Ordem `DRAFT` → `APPROVED` → `PUBLISHED`. | 200/201; publicação direta do rascunho 409 `SERVICE_ORDER_STATE` (o contrato exige aprovar antes) | `ledger_entries` APPROVED 1234 e REJECTED 500. `service_orders` PUBLISHED. |
| SECRETARIA | BLOCKED | PASS | Família, ficha, Ficha 360, admissão `ACLAMACAO`, aniversários, mapa, aviso de aniversário sem canal real, evento gratuito publicado. | Família e pessoa ausentes → registros com o prefixo. Admissão criada em `AWAITING_DOCUMENTS`. | 200/201 | Família e admissão relidas por GET. |
| TESOURARIA | BLOCKED | PASS | Contas, centro de custo e saldos. Despesa de R$ 12,34. O próprio tesoureiro não conclui a aprovação. OFX fictício de uma linha, reenvio idempotente, conciliação aberta. PDF e planilha. | Saldo passou a exibir **-R$ 12,34** na visão da tesouraria. OFX ausente → 1 linha; segundo POST `alreadyImported=true`. | Despesa 201. Autoaprovação **403** «pertence ao pastor». Conciliação 201. Casar a linha com a despesa **409** (movimento diferente). Exportes 200, `%PDF` e XML de planilha. | `ledger_entries` e lote OFX no Postgres local. |
| LIDER_MINISTERIO | BLOCKED | PASS no próprio ministério; mês de Louvor BLOCKED | Conta do seed é a de Jovens. Lê o próprio ministério e recebe 403 `MINISTRY_SCOPE_FORBIDDEN` na Atmosfera. Simula e grava 2026-12 de Jovens. | Jovens devolveu 0 cultos, então a gravação não criou escala. | 200/201 no próprio; 403 no alheio | Sem roster de Jovens. |
| LIDER_MODULO | BLOCKED | PASS | Não havia conta nem linha em `ministry_roster_module_leaders` (0). A secretaria criou a pessoa sintética e o admin concedeu `LIDER_MODULO` no módulo QA, com convite em preview (sem e-mail). Ativou, entrou, editou a regra do próprio módulo. Sorteio do Louvor e leitura de Jovens: 403. | Vínculo ausente → 1 linha. | 201 na concessão e no login; 200 no PATCH; 403 no ministério alheio | `ministry_roster_module_leaders` = 1 para o módulo e a pessoa sintéticos. |
| MEMBRO | BLOCKED | PASS nas ações existentes; escala BLOCKED | Minha Conta, Meu espaço, QR opaco da carteirinha, inscrição no evento gratuito e releitura da própria inscrição. Tesouraria e secretaria: 403. | Sem inscrição → inscrição 201 com ticket. | 200/403 conforme a rota | Inscrição relida em `/member-events/registrations`. |
| CONVIDADO | BLOCKED | PASS | Cadastro e segundo login. Inscrição no mesmo evento. Tesouraria e secretaria: 403. | Conta ausente → papel CONVIDADO. | 201 e 403 | Usuário sintético `@example.test`. |
| EDITOR_SITE | BLOCKED | PASS | Rascunho de notícia, releitura, envio a revisão. Publicar direto: 403. Foto PNG de 1×1 gravada no disco local. Tesouraria e pastoral: 403. | Conteúdo ausente → `RASCUNHO` → `REVISAO`. Arquivo ausente → PNG em disco. | 201/200; publicar 403; upload 503 sem `SITE_MEDIA_STORAGE=local` e 201 com o flag | `cms_contents` em revisão antes da publicação pelo publicador. |
| PUBLICADOR_SITE | BLOCKED | PASS | Aprovou e publicou a notícia do editor. Conteúdo público releu o título. Tesouraria e pastoral: 403. | `REVISAO` → `APROVADO` → `PUBLICADO`. `REVISAO` → `PUBLICADO` direto responde 400, como o contrato. | 201 e depois GET público 200 | `cms_contents.status=PUBLICADO`. |

Tesouraria 2 existe no seed só como segundo tesoureiro. Não é uma das nove personas. Não precisou aprovar: a despesa já nasce com a primeira conferência do autor e a decisão final é do pastor.

## Lacunas que continuam BLOCKED

- **MFA do administrador e dos papéis privilegiados na QA.** A API hospedada exige o segundo fator e a senha documentada do seed não abre nem o desafio. Sem TOTP, não há sessão hospedada.
- **E2E do frontend DEV.** O SSO da Vercel responde antes de qualquer rota da igreja.
- **Conferência do Neon QA.** Sem `DATABASE_URL` de `br-twilight-bonus-b6moawk7`. Os efeitos acima estão no Postgres local, não nesse branch.
- **Aceitar ou recusar escala como membro.** O seed não tem designação. Atribuir Bruno a uma vaga da Atmosfera respondeu 409 `ROSTER_MODULE_TEAM_REQUIRED`: ele não está na equipe daquele módulo. A recusa de quem está fora da equipe ficou demonstrada; o fluxo feliz da escala do membro, não.
- **Mês inteiro do Louvor.** `prepare-louvor` encontra o módulo que o seed já criou e retorna `created=false`, `people=0`, sem gerar cultos. A simulação de 2026-12 do Louvor e a de Jovens voltaram com 0 escalas. O mês da Atmosfera foi gravado pelo PLATFORM_ADMIN (91 rascunhos), não por um líder de ministério do Louvor — o seed não tem login `LIDER_MINISTERIO` para Louvor nem para Atmosfera; `leaderPersonId` desses ministérios aponta o membro demo.

## Isolamento

- Membro, convidado, editor e publicador recebem 403 real em `/ledger/accounts`, não só menu oculto.
- Membro e convidado recebem 403 em `/memberships`.
- Editor e publicador recebem 403 em `/pastoral/congregation`.
- Líder de Jovens e líder do módulo QA recebem 403 ao abrir o ministério um do outro.
- A secretaria, que também tem grant na congregação demo 2, continuou lendo a família do piloto depois de `POST /auth/switch-church` (200). O grant do piloto permanece no token e a API de famílias opera a igreja piloto. Não houve leitura de dado da igreja 2 por quem não tem grant.

## Capturas

Pasta `docs/qa/evidence/screenshots/`. Hospedado: só a parede de SSO, 1440 e 390. Local, com o painel ligado: login, Gestão do Sistema (o módulo renomeado aparece na Atmosfera), Ordem de Culto, Secretaria, Tesouraria (saldo -R$ 12,34), Ministérios, Minha Conta, Mídia e conteúdo, área do convidado. Secretaria e Tesouraria também em 320. Nomes visíveis são os do seed fictício (`@example.test`), sem dado real.

## P0 / P1 / P2

**P0 — bloqueia o aceite hospedado**

1. SSO da Vercel no frontend DEV impede qualquer jornada de navegador na URL obrigatória.
2. Credencial sintética documentada não autentica na API QA, e o MFA está bloqueante. Sem segredo de QA neste runner, as nove personas ficam sem E2E hospedado.
3. Não há como conferir `access_scope_bindings` nem `ministry_roster_module_leaders` no Neon QA a partir daqui.

**P1 — dado ou contrato local, sem correção de código nesta rodada**

1. Seed sem designação elegível para o membro aceitar ou recusar escala.
2. Louvor não materializa o mês: o preparo inicial é no-op quando o módulo já existe e a simulação não devolve cultos.
3. Não há usuário `LIDER_MINISTERIO` de Louvor nem de Atmosfera no seed. O mês da Atmosfera foi persistido pelo administrador da plataforma.

**P2**

1. Upload de mídia responde 503 até `SITE_MEDIA_STORAGE=local` e `SITE_MEDIA_LOCAL_ROOT`. Com os dois, o PNG sintético gravou e a rota respondeu 201.
2. Casar a linha OFX de -R$ 12,34 com a despesa de R$ 12,34 em outra conta foi recusado com 409. A importação e a conciliação em si passaram; o 409 é a trava de movimento diferente.

Não há patch de produto neste PR. Os 409 e 403 acima cumprem o contrato atual (ordem de culto só publica depois de aprovada; editor não publica; transição editorial `REVISAO` → `PUBLICADO` é inválida; tesoureiro não dá a aprovação final da própria despesa). Corrigir o SSO, a senha/MFA da QA ou o seed do Louvor exige credencial ou decisão que este ambiente não tem. HML e produção não foram alterados.
