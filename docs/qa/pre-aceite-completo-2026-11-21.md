# Pré-aceite integral — 21/11/2026

Veredito: **NO-GO** em todas as frentes. O responsável não deve começar a rodada de aceite.

Base de código: `feat/rf1-revisao-18-11` em `61f1ed83eab1bfb2a6a97263c8d4e4726b15a54e`. A API `https://id-riacho1-api-qa.vercel.app` respondeu, nesta execução, `/meta` com `stage=non-production`, `sourceSha=61f1ed83eab1bfb2a6a97263c8d4e4726b15a54e`, `hmlPublicUrl=null`, `contractVersion=0.7.4-rf025`, e `/ready` com `database=ok`, `commit=61f1ed83eab1`, `authState=prisma`, `mfaBlocking=true`. O SHA anunciado confere com o HEAD da branch DEV e inclui o SMTP #248 (`be257fd`) e a auditoria #250 (`231ea34`). `/meta` não informa projeto nem ramo Neon, então o banco por trás da API não foi provado como `flat-tree-17047178` / `br-twilight-bonus-b6moawk7`.

Nada foi publicado em HML, GitHub Pages, Hostinger ou produção. Nenhuma migração, seed, cobrança, e-mail ou WhatsApp foi disparado. `DATABASE_URL`, `QA_DEMO_PASSWORD`, `VERCEL_TOKEN` e `NEON_API_KEY` não estavam neste ambiente.

## Seeds #252 e #253

As duas propostas abrem o mesmo `scripts/qa/seed-complete-dev.mjs` e alteram os mesmos componentes de agenda. Não foram mescladas em bloco.

Ficou uma solução só, a desta branch:

- Catálogo, 32 pessoas `qacomp_`, 6 eventos futuros, 4 passados, carteirinhas, check-in, ministério, escalas, trilha, despesa e extratos fictícios vêm da #253.
- 32 retratos e 10 capas são JPEG distintos com assinatura `FF D8 FF` (42 arquivos, 42 hashes). São ilustrações geométricas, de cerca de 2 KiB, não fotografias.
- A guarda da #252 entra no host: `--apply` no Neon só segue se o hostname contém `br-twilight-bonus-b6moawk7`. Colocar o ramo em `application_name` não autoriza. Hosts `ep-misty-silence` e `b6n7k8ez`, estágio HML/produção e `VERCEL=1` são recusados. Continuam exigidos `QA_SEED_CONFIRM`, `QA_SEED_PROJECT`, `QA_SEED_OPERATOR=qa-dev`, `sslmode` e a confirmação de `/meta` e `/ready`. Se o Postgres devolver `neon.branch_id`, ele precisa ser o ramo QA.
- A agenda pública aceita capa local só em `/images/qa/` e `/images/synthetic/`. Foto oficial e caminho com `..` continuam de fora. HTTPS publicado permanece.
- O PDF da carteirinha só embute JPEG de até 192 KiB. Outro tipo ou arquivo maior vira iniciais, no mesmo quadro da Ficha 360.

O plano offline e duas aplicações em banco de memória mantiveram os mesmos identificadores e não gravaram `passwordHash`. O `--apply` no Neon **não rodou**. As contas novas nascem sem senha e não substituem as personas já existentes.

## O que foi executado

| Evidência | Onde | Resultado |
| --- | --- | --- |
| `GET /meta` e `GET /ready` | API QA hospedada | SHA `61f1ed83`, banco ok, MFA bloqueante, estágio non-production |
| `GET /public/events` | API QA hospedada | 10 eventos, nenhum já encerrado; ainda há títulos de teste (`TESTE 3M`, `Teste DEV`) |
| `GET /public/youtube-live` | API QA hospedada | `broadcast: null` (sem selo de ao vivo) |
| `GET /public/home` | API QA hospedada | 200, igreja de demonstração |
| `GET /auth/me`, `/pastoral-cases`, `/persons/search`, `/ledger/accounts`, `/credentials/me` sem sessão | API QA hospedada | 401 `SESSION_INVALID` |
| `POST /auth/login` com senha inexistente de `@example.test` | API QA hospedada | 401 `INVALID_CREDENTIALS` |
| `GET /public/registrations/` com código inexistente | API QA hospedada | 404, sem vazar cadastro |
| `node --test scripts/qa/seed-complete-dev.test.mjs` | local, sem banco | 6 passaram |
| Vitest `portal-live-data.test.ts` | local | 5 passaram |
| Jest carteirinha, conta de recebimento, pacote DEV, assinatura Mercado Pago, acesso à carteirinha | local, mock | 23 passaram |
| `rbac`, segurança F11 e pacote compartilhado | local | 27 passaram |

Total desta rodada: **61 testes, 61 passaram**. A suíte inteira dos workspaces não foi executada. Não houve PostgreSQL local (`psql` e Docker ausentes), então a idempotência da seed foi em memória, não em Postgres descartável. Não houve E2E de navegador, viewport nem Safari.

## Matriz persona × módulo

Papéis de código: administrador, pastor, secretaria, tesouraria, líder de ministério, editor, publicador, membro e convidado. Líder de módulo, mentor e leitor de QR existem como escopo de grant ou delegação de evento, não como papel próprio. Voluntário entra por interesse e disponibilidade, não por um papel separado.

Cada linha autenticada abaixo está **não executado/bloqueado**: não havia senha de persona e a massa `qacomp_` não foi gravada. A coluna de API hospedada só cobre a chamada anônima.

| Perfil | Módulo | Ação | API | Banco | Permissão | Viewport | Resultado | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Convidado | Portal | Agenda, início, ao vivo | `GET /public/events`, `/public/home`, `/public/youtube-live` | leitura QA, ramo não provado | pública | não medido | passou hospedado | 10 futuros, broadcast nulo |
| Convidado | Eventos | Inscrição sem sessão | código exige sessão | não escrito | anônimo deve tomar 401 | não medido | não executado neste POST | teste de unidade do pacote cobre o slug de retorno |
| Todos | Sessão | Login inválido, `/auth/me` | 401 | não escrito | anônimo | n/a | passou hospedado | uma tentativa, sem força bruta |
| Administrador | Regras | Publicar bloqueio de sessão/MP/BRB/Sicoob | `draft` recusa chave locked | não escrito | admin | n/a | passou mock | `piloto-pacote.service.spec.ts` |
| Pastor / secretaria | Pastoral | Ler texto de oração e sino | sem sessão 401 | não lido | pastoral | n/a | passou hospedado só o 401 | texto não foi pedido |
| Secretaria | Carteirinha | PDF com JPEG, PNG e arquivo grande | renderer local | não escrito | não exercida na API | n/a | passou mock | `credential-pdf.renderer.spec.ts` |
| Tesouraria | Recebimento | Trocar Mercado Pago com pagamento `PENDING` | 409 antes do update | não escrito | tesouraria | n/a | passou mock | `receiving-account.guard.spec.ts` |
| Tesouraria | BRB/Sicoob | Extrato live | regra locked em mock | não contactado | n/a | n/a | simulado | catálogo de 12 regras |
| Líder / módulo | Escalas | Aceite, recusa, substituição | não chamada | não escrito | não exercida | n/a | não executado/bloqueado | seed cobre o cenário, sem apply |
| Membro | Eventos | Retomar inscrição e QR | não chamada | não escrito | sessão obrigatória no código | n/a | não executado/bloqueado | sem conta |
| Leitor de QR | Check-in | QR de outro evento, cancelado, pendente | não chamado na API QA | não escrito | delegação no código | n/a | passou mock | pacote compartilhado recusa ingresso alheio |
| Qualquer | Permissão negativa | IDOR, outra congregação, mass assignment | não chamada autenticada | não escrito | RBAC de unidade | n/a | passou mock parcial | `rbac.test.ts`; falta duas contas reais |

## Inventário

- 44 páginas em `apps/web/src/app`, entre elas início, a igreja, agenda, login, recuperação, cadastro, inscrição, carteirinha pública e a área `/app` (pastoral, secretaria, tesouraria, ministérios, escalas, louvor, editorial, gestão do sistema, mapa, orações).
- 244 caminhos no `/meta` da API QA, todos marcados `implemented` pelo próprio processo. Isso é o contrato anunciado pelo deploy `61f1ed83`, não uma execução de cada verbo.
- 114 models Prisma e 54 migrações. `migrate deploy` não foi rodado aqui.
- Um agendamento no `apps/api/vercel.json`: `POST /rosters/notifications/run` a cada 15 minutos, fuso `America/Sao_Paulo`. Não foi disparado.
- 12 regras no catálogo da migração `20261120183000`. Quatro ativas (aniversário, pastor titular, substituto, validade da recuperação), quatro bloqueadas (sessão na inscrição, Mercado Pago, BRB, Sicoob) e quatro só documentadas (fuso, semana de Louvor, Ceia manual, cor da carteira). As outras 34 de um catálogo de 46 não estão no repositório e não foram inventadas. Classificação: **inexistente**.

Integrações: Mercado Pago, Pix, BRB e Sicoob permanecem mock no código e no catálogo. SMTP do #248 está no SHA implantado; o envio não foi provado porque não há token da Vercel nem caixa de teste usada nesta rodada. YouTube ao vivo respondeu sem transmissão.

## Achados

P0 — o aceite não pode começar:

- Não houve jornada autenticada de nenhuma persona. Sem `QA_DEMO_PASSWORD` não há login, e forçar senha está fora do gate.
- A massa visual não está no Neon. Sem `DATABASE_URL` o `--apply` nem abre conexão.

P1 corrigido neste PR, ainda não implantado na API QA:

- A conta de recebimento não troca o recebedor do Mercado Pago enquanto existir pagamento `PENDING` na mesma conta e na mesma congregação. Repetir o mesmo valor continua permitido.
- A agenda deixa de aceitar qualquer caminho `/images/`; só biblioteca sintética local ou HTTPS.
- PDF da carteirinha não recebe PNG nem JPEG acima de 192 KiB.
- A seed recusa Neon cujo ramo apareça só em parâmetro decorativo da URL.

P1 que continua aberto:

- A API QA ainda publica eventos de teste futuros. Nenhum registro foi apagado.
- As correções deste PR não estão no SHA `61f1ed83`.
- Matriz negativa autenticada (duas contas, outra igreja, outro evento) não foi chamada na API hospedada.

P2: retratos são ilustração geométrica; suíte completa não rodou; Postgres descartável indisponível; preview web com nome de HML não foi aberto; Safari físico indisponível; 34 regras desejadas inexistentes.

P3: o nome do database QA continua `idriacho1_hml`, igual ao da homologação. A guarda exige o ramo no host justamente por isso.

## Segurança e LGPD

Não é declaração de conformidade. A base legal, os contratos com operadores e a retenção precisam do responsável jurídico.

Nesta rodada, sem exploração de terceiros: rotas privadas sem sessão devolveram 401; login inválido não revelou se a conta existe além da mensagem genérica já usada pela API; código de inscrição inexistente devolveu 404; auditoria de unidade remove segredo, e-mail e CPF do metadata; webhook do Mercado Pago verifica `x-signature` antes de confirmar (teste local de assinatura, sem POST na API QA). Orações, documentos de menor, endereço, geolocalização e lançamentos financeiros não foram lidos nem copiados para este relatório.

Riscos que permanecem: E2E de IDOR autenticado não feito; seed não aplicada e portanto não revalidada no ramo real; chaves Pix e coletor não devem aparecer em log (o teste novo não grava o coletor no metadata de auditoria desta ação); backup e expurgo não foram ensaiados aqui.

## Parecer por frente

| Frente | Parecer | Motivo |
| --- | --- | --- |
| Arquitetura e segurança | NO-GO | Sem sessão real, sem IDOR autenticado, correções ainda fora do deploy |
| Dados e Neon | NO-GO | Seed não aplicada; ramo do banco da API não comprovado por `/meta` |
| Funcionalidades e UX | NO-GO | Sem navegação autenticada e sem captura de viewport |
| Eventos e checkout | NO-GO | Checkout segue mock; inscrição autenticada não executada |
| SMTP | NO-GO | Código do #248 está no SHA; envio não foi feito |
| BRB e Sicoob | NO-GO | Mock declarado, sem API bancária |
| Permissões | NO-GO | Uma conta contra a outra não foi exercida |
| Mobile | NO-GO | Sem aparelho e sem emulação nesta rodada |

## Roteiro para quando o bloqueio cair

Não usar este texto como convite de teste ainda.

1. Conferir de novo `GET /meta` e `GET /ready` e só então decidir o deploy desta branch na API QA. Não apontar HML nem produção.
2. Com a URL do ramo `br-twilight-bonus-b6moawk7` nas mãos do operador, rodar primeiro `--dry-run`. O `--apply` pede `IDBRF_RUNTIME_STAGE=qa`, `QA_SEED_CONFIRM`, `QA_SEED_PROJECT` e `QA_SEED_OPERATOR=qa-dev`. Repetir uma segunda vez e comparar contagens. Não limpar o banco e não alterar senha.
3. Entrar com as personas QA que já existem. A senha não está no Git e não deve ser colada em issue. As contas `qacomp-*@example.test` não recebem senha nesta seed.
4. Percorrer, em cada persona, o menu permitido e uma chamada direta da API proibida, esperando 403 ou 404. Recarregar o navegador depois de criar um registro.
5. Evento pago: só mock. Não gerar cobrança Mercado Pago, Pix ou e-mail fora de `@example.test` explicitamente autorizado.

O procedimento seguro se a URL do Neon continuar fora do agente é o operador rodar o comando no ambiente que já guarda o segredo, com a guarda acima. O agente não deve receber a URL no chat.
