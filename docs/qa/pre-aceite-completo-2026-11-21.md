# Pré-aceite integral — reteste hospedado em 21/11/2026

Veredito: **NO-GO** em todas as frentes. O responsável não deve começar a rodada de aceite.

Esta rodada reexecutou a API e o endereço DEV publicados depois da integração do PR #255. A base continua `feat/rf1-revisao-18-11` em `235ad02dec1a076ca4c7e27ed329a794cd9cf1b6`. Não houve alteração de código de produto nesta rodada, nem deploy, migração, seed, cobrança, e-mail, WhatsApp, HML ou produção.

## O que a publicação confirma

`GET https://id-riacho1-api-qa.vercel.app/meta` respondeu `stage=non-production`, `sourceSha=235ad02dec1a076ca4c7e27ed329a794cd9cf1b6`, `hmlPublicUrl=null`, `contractVersion=0.7.4-rf025`, 244 caminhos. `GET /ready` respondeu `database=ok`, `commit=235ad02dec1a`, `authState=prisma`, `mfaBlocking=true`. O SHA confere com o HEAD da branch DEV e inclui os guardrails do #255 e o alinhamento visual de recuperar/redefinir senha (`d15dad7`). `/meta` continua sem projeto e sem ramo Neon. O banco por trás da API não foi provado como `flat-tree-17047178` / `br-twilight-bonus-b6moawk7`.

`DATABASE_URL`, `QA_DEMO_PASSWORD`, `VERCEL_TOKEN` e `NEON_API_KEY` não estavam neste ambiente. A senha documentada do seed local foi tentada **uma vez** em cada uma das oito contas `*.demo@example.test`. Todas responderam `401 INVALID_CREDENTIALS`. Não houve segunda senha nem força bruta.

O endereço oficial `https://id-riacho1-web-hml-git-0d6b26-gustavomarqueslopes-cmds-projects.vercel.app/` respondeu `302` para o SSO da Vercel. O alias `https://id-riacho1-web-hml.vercel.app/` também cai nesse login. Nenhuma página do portal, login, recuperação ou área autenticada foi renderizada. Viewport, teclado, contraste e Safari não foram medidos.

## Classificação das provas

| Prova | Onde | Resultado |
| --- | --- | --- |
| `/meta` e `/ready` | API QA | passou hospedado: SHA `235ad02`, banco ok, MFA bloqueante, non-production |
| Agenda, início, ministérios, YouTube | API QA | passou hospedado a leitura; 10 eventos futuros; `broadcast: null`; igreja "Riacho Fundo I (demo)" |
| Rotas privadas sem sessão | API QA | passou hospedado: 401 `SESSION_INVALID` |
| Login inválido e e-mail com aspas | API QA | passou hospedado: 401 genérico e 400 `VALIDATION_ERROR`, sem erro de SQL |
| Recuperação de e-mail inexistente `@example.test` | API QA | passou hospedado: 201 neutro, sem token no corpo |
| Inscrição sem sessão e código de presença inexistente | API QA | passou hospedado: 401 e 404 |
| Webhook Mercado Pago com assinatura inválida | API QA | passou hospedado: 401, sem confirmação |
| Webhook mock de pagamento com assinatura inválida | API QA | passou hospedado como recusa: 404. O segredo curto ou ausente esconde a rota antes do HMAC |
| CORS | API QA | a origem oficial do preview é aceita; `igrejadeusrf1.com.br`, a API de produção, `evil.example` e o alias estável do projeto não são refletidos |
| Oito personas do seed | API QA | não executado/bloqueado: a senha documentada foi recusada |
| Convidado sintético novo | API QA | passou hospedado, só esse papel: grant `CONVIDADO`, 403 nas rotas sensíveis, logout revoga |
| SMTP real | — | não executado/bloqueado: nenhum envio |
| Neon, ramo e seed `qacomp_` | — | não executado/bloqueado: sem `DATABASE_URL` |
| UX hospedada, viewports, Safari | web DEV | não executado/bloqueado: Deployment Protection da Vercel |
| Suíte local da rodada anterior (61 testes) | local, mock ou memória | não reexecutada; o código de produto não mudou |

Varredura anônima dos GET sem parâmetro anunciados em `/meta`: 49 responderam 401, sete responderam 200 (`/health`, `/meta`, `/public/home`, `/public/events`, `/public/ministries`, `/auth/oidc/authorize`, `/vivi/status`) e `/auth/oidc/callback` respondeu 501. OIDC declara `liveIdp=false` e lista nomes de variáveis, não valores. O Riachinho declara `provider=mock`. A agenda e o início públicos não trouxeram e-mail nem CPF. Os três textos de local não têm forma de logradouro.

## Matriz persona × módulo

Papéis de código: administrador, pastor, secretaria, tesouraria, líder de ministério, editor, publicador, membro e convidado. Líder de módulo, mentor e leitor de QR são escopo ou delegação, não um papel próprio.

| Perfil | Módulo | Ação | API | Banco | Permissão | Viewport | Resultado | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Convidado anônimo | Portal | Agenda, início, ministérios, ao vivo | GET públicos | leitura, ramo não provado | pública | bloqueado no SSO | passou hospedado | 10 futuros, 5 ministérios, broadcast nulo |
| Convidado anônimo | Eventos | Inscrever sem sessão | `POST /public/events/qacomp-mocas/registrations` | não escrito | 401 | n/a | passou hospedado | `SESSION_INVALID` |
| Convidado novo | Sessão | Cadastro, `/auth/me`, logout | `POST /auth/guest-registration`, `POST /auth/logout` | uma pessoa `VISITOR` fictícia | `CONVIDADO` | n/a | passou hospedado | JWT, depois 401 |
| Convidado novo | Permissão negativa | Pastoral, ficha, dossiê, tesouraria, escalas, regras, carteirinha | GET autenticado | não escrito | 403 | n/a | passou hospedado | `FORBIDDEN` |
| Administrador, pastor, secretaria, tesouraria, líder, membro, editor, publicador | Sessão | Login com a senha do seed | `POST /auth/login` | não escrito | contas `*.demo@example.test` | n/a | não executado/bloqueado | 401 na única tentativa |
| Administrador | Regras | Publicar trava de sessão, Mercado Pago, BRB, Sicoob | não chamado com admin | não escrito | não exercida | n/a | passou mock na rodada anterior | spec do pacote; sem reteste de admin |
| Pastor / secretaria | Pastoral | Ler oração | sem sessão 401; convidado 403 | texto não lido | pastoral | n/a | passou hospedado só a recusa | corpo pastoral não veio |
| Tesouraria | BRB/Sicoob/OFX | Extrato | não chamado | não contactado | n/a | n/a | simulado | sem API bancária |
| Membro | Eventos | Retomar inscrição e QR | não chamado | não escrito | sessão obrigatória no código | n/a | não executado/bloqueado | sem sessão de membro |
| Leitor de QR | Check-in | Código inexistente | GET público | não escrito | n/a | n/a | passou hospedado o 404 | câmera e QR alheio não rodaram na API |
| Qualquer par | IDOR | Duas contas e outra congregação | não chamado | não escrito | n/a | n/a | não executado/bloqueado | só existiu uma sessão, a do convidado novo |

A conta criada para essa prova chama-se "Visitante QA Gate", usa `@example.test` e foi deslogada. A senha não entra neste relatório. Nenhum e-mail foi disparado por esse cadastro.

## Inventário confrontado com o deploy

- 44 páginas em `apps/web/src/app`. Login usa `login-screen.module.css`. Recuperar e redefinir usam `activate-access.module.css`, cuja primeira linha declara a mesma linguagem visual do login. Isso é leitura de código do SHA `235ad02`, não captura hospedada.
- 244 caminhos no `/meta`, todos marcados `implemented` pelo processo. A varredura acima cobre os GET sem parâmetro e os fluxos citados. Não é execução de cada POST.
- 114 models Prisma e 54 migrações no repositório. `migrate deploy` não rodou.
- Um cron em `apps/api/vercel.json`: `POST /rosters/notifications/run` a cada 15 minutos, fuso `America/Sao_Paulo`. Não foi disparado.
- 12 regras no catálogo. Quatro ativas, quatro bloqueadas e quatro documentadas. As outras 34 de um conjunto de 46 não estão no repositório: **inexistente**.
- A agenda ao vivo não é a massa `qacomp_` do #255. Os slugs são `rf1qa3-event-11-*`, `qa-*` e `dev-*`. As capas são SVG em `/images/qa/events/`, não os JPEG novos. Dois eventos de teste não têm `endsAt`. Nove aceitam inscrição. Nenhum registro foi apagado.

Integrações: Mercado Pago recusou assinatura inválida e não confirmou pagamento. O checkout em si não foi aberto. Pix, BRB e Sicoob não foram contactados. SMTP não foi usado. YouTube não está ao vivo. O preview web, pelo `next.config.ts`, aponta a API QA quando `VERCEL_ENV=preview` e o ref é `feat/rf1-revisao-18-11`; o HTML publicado não pôde ser lido por causa do SSO, então o bundle servido não foi inspecionado.

## Achados

P0 — o aceite não começa:

- Sete papéis operacionais e o administrador não abriram sessão. Sem o segredo da senha QA não há jornada de pastor, secretaria, tesouraria, líder, membro, editor ou publicador, nem o desafio MFA desses papéis.
- A massa `qacomp_` não está na agenda publicada. Sem `DATABASE_URL` o `--apply` não corre. O ramo Neon segue não comprovado.
- O site DEV oficial não abre sem sessão da equipe na Vercel. Não há evidência hospedada de UX.

P1 que permanece:

- A agenda pública ainda mostra "TESTE 3M" e "Teste DEV", com datas de 22/11/2026 a 17/01/2027.
- SMTP real não foi provado. Chamar a recuperação de uma conta existente poderia enviar mensagem; isso não foi feito.
- Matriz entre duas contas já existentes, outra igreja e outro evento não foi chamada.
- Checkout, Pix, check-in por câmera, escalas, louvor e tesouraria autenticados não rodaram.

P2: o webhook mock de evento responde 404 quando o segredo não tem 32 caracteres; a verificação HMAC desse stub não foi o caminho exercido. A suíte de 61 testes locais não foi repetida. Postgres descartável e Safari físico continuam indisponíveis. Trinta e quatro regras desejadas seguem inexistentes.

P3: o database QA ainda se chama `idriacho1_hml` na documentação operacional. O JSON público do OIDC cita o nome da variável do segredo, não o valor.

## Segurança e LGPD

Isto não é conformidade jurídica. Base legal, contratos de operador, retenção e backup precisam do responsável jurídico.

Nesta rodada, sem exploração de terceiros: rotas privadas sem sessão deram 401; o convidado recebeu 403 em oração, dossiê, pessoas, tesouraria, escalas, regras e carteirinha; o rascunho de regra não foi gravado; login inválido não distingue conta ausente de senha errada; inscrição alheia inexistente deu 404; webhook do Mercado Pago com assinatura ruim deu 401 antes de confirmar; CORS não reflete a origem de produção; falha de login não gravou cookie; HSTS está presente. Orações, documentos de menor, endereço de pessoa, geolocalização e lançamentos não foram lidos. O único write foi o visitante fictício já deslogado.

Riscos que permanecem: IDOR entre contas reais não foi feito; a seed nova não foi aplicada no ramo; backup e expurgo não foram ensaiados; o site protegido por SSO impede o próprio aceite visual.

## Parecer por frente

| Frente | Parecer | Motivo |
| --- | --- | --- |
| Arquitetura e segurança | NO-GO | Há 401/403 e webhook recusado, mas falta sessão dos papéis privilegiados e IDOR entre contas |
| Dados e Neon | NO-GO | Banco responde; ramo não comprovado e a massa `qacomp_` não está publicada |
| Funcionalidades e UX | NO-GO | O site oficial não renderizou; sem viewport |
| Eventos e checkout | NO-GO | Sessão obrigatória e assinatura ruim foram recusadas; checkout não executado |
| SMTP | NO-GO | Nenhum envio real |
| BRB e Sicoob | NO-GO | Mock, sem chamada bancária |
| Permissões | NO-GO | Só o convidado novo teve matriz negativa |
| Mobile | NO-GO | SSO bloqueou o site; sem aparelho e sem emulação |

## Roteiro para derrubar o bloqueio

Ainda não é convite de teste.

1. Abrir o endereço oficial já autenticado na equipe Vercel, ou entregar ao testador o bypass de Deployment Protection fora do chat e do Git. Sem isso não há UX hospedada.
2. Confirmar de novo `/meta` e `/ready`. O SHA esperado hoje é `235ad02dec1a076ca4c7e27ed329a794cd9cf1b6`.
3. Aplicar a seed só no ambiente que já guarda a URL do ramo `br-twilight-bonus-b6moawk7`: primeiro `--dry-run`, depois `--apply` com `IDBRF_RUNTIME_STAGE=qa`, `QA_SEED_CONFIRM`, `QA_SEED_PROJECT` e `QA_SEED_OPERATOR=qa-dev`. Repetir e comparar contagens. Não limpar o banco e não alterar senha. As contas `qacomp-*@example.test` nascem sem senha.
4. Informar `QA_DEMO_PASSWORD` por segredo do executor, nunca neste relatório. As contas são `platform.demo@example.test`, `ana.demo@example.test`, `pastor.demo@example.test`, `tesouraria.demo@example.test`, `lider.jovens.demo@example.test`, `bruno.demo@example.test`, `editor.demo@example.test` e `publicador.demo@example.test`.
5. Com sessão, percorrer o menu permitido e uma chamada direta proibida, esperando 403 ou 404. Papel privilegiado precisa concluir o MFA sem desligar o bloqueio.
6. SMTP só para uma caixa de teste já autorizada. Evento pago só em mock. Não gerar cobrança, Pix ou mensagem para pessoa real.

A rodada anterior, no SHA `61f1ed83`, ficou neste mesmo arquivo antes da integração. Aquela API já foi substituída pelo SHA acima. Os 61 testes locais daquela rodada não foram repetidos aqui.
