# Aceite funcional — personas B (23/11/2026)

Issue desta frente: #311. Issue mestre: #309.

Candidata: `chatgpt/dev-prehml-final-gates-20261123` SHA `5f32bb3fd4006e8f3276721210e4664e5a59b6d3`.

Prefixo dos registros sintéticos: `QA-PERSONA-B-20261123`. Mês exercitado nas escalas: `2027-03`. Nenhuma senha, token ou dado pessoal real entra neste relatório.

## Superfícies

| Superfície | O que foi exercitado | Resultado |
|---|---|---|
| UI hospedada DEV | `https://id-riacho1-web-hml-git-0d6b26-gustavomarqueslopes-cmds-projects.vercel.app/` | **HOSTED BLOCKED.** Resposta 302 para o SSO da Vercel. O SSO não foi contornado. |
| API QA hospedada | `https://id-riacho1-api-qa.vercel.app` | **HOSTED BLOCKED** para jornada autenticada. `GET /ready` 200, `database=ok`, `commit=5f32bb3fd400`, `mfaBlocking=true`. `GET /auth/me`, `GET /ledger/accounts` e `GET /ministries` sem sessão retornam 401. Este ambiente não tem sessão autorizada nem segredo de MFA. Nenhuma senha foi enviada à API QA. |
| Neon QA `br-twilight-bonus-b6moawk7` | banco compartilhado do projeto `flat-tree-17047178` | **Não contactado e não alterado.** Não há `DATABASE_URL` desta branch neste ambiente. HML `br-jolly-darkness-b6f5mzsy`, `main` e produção não foram usados. |
| Postgres local `idbrf_qa_persona_b` em `127.0.0.1` | API e painel do mesmo SHA, contas `example.test` | **LOCAL.** Não substitui o E2E hospedado. |

A contagem `ministry_roster_module_leaders=0` citada na #309 permanece o estado conhecido do QA compartilhado. O catálogo `roles` não tem `LIDER_MODULO` e a API não expõe criação dessa concessão. Por isso a persona no Neon QA fica **BLOCKED**. No Postgres local, a concessão sintética foi inserida só como fixture descartável, para provar o comportamento do código.

## Matriz LOCAL

| Persona | Ação | Antes | Depois | HTTP | Veredito |
|---|---|---|---|---|---|
| TESOURARIA | Despesa sintética de R$ 45,00 no centro `QAPB-20261123`; criador e outro tesoureiro tentam aprovar; pastor aprova | saldo do banco `1.1.02` ausente (zero lançamentos aprovados de caixa); 0 despesas com o prefixo | lançamento `PENDING_APPROVAL` na criação; depois `APPROVED`; segundo aprovador é o pastor, diferente do criador; saldo `1.1.02` = -4500 centavos | criar 201; tesoureiro criador 403; outro tesoureiro 403 ("A aprovação final desta despesa pertence ao pastor"); pastor 201 | **LOCAL PASS** |
| TESOURARIA | OFX sintético em memória, conciliação, saldos, PDF e Excel | 1 lote e 1 conciliação da seed | JSON OFX `PARSED` 201; upload `.ofx` `PARSED` 201; conciliação 201; linha `MATCHED` à despesa; PDF `%PDF` (1530 bytes); Excel SpreadsheetML `application/vnd.ms-excel` com o prefixo (1225 bytes). `liveBankApis=false` | 201 | **LOCAL PASS** |
| TESOURARIA | Membro e líder de módulo leem tesouraria | líder de módulo sem grant financeiro | ambos recebem 403 da API. No painel, o membro vê "Seu perfil não tem acesso a esta página" | 403 | **LOCAL PASS** |
| LIDER_MINISTERIO | Sorteio de março/2027 do Louvor, rascunho, publicação e ministério alheio | 0 escalas | simulação 12 cultos; gravação 12 rascunhos; publicação 12. Líder do Louvor na Atmosfera 403. Líder de Jovens no Louvor 403 | 201 / 403 | **LOCAL PASS** |
| LIDER_MINISTERIO | Sorteio de março/2027 da Atmosfera, publicação e edição de integrante | 0 vínculos no módulo alvo | simulação 72 linhas; 60 escalas publicadas; integrante sintético passou a ter o módulo Conexão ativo | 201 e PATCH 200 | **LOCAL PASS** |
| LIDER_MODULO | Ver só Recepção; negar mês inteiro, publicação do mês e módulo alheio | `ministry_roster_module_leaders=0` | 1 concessão local; lista `scope=modules` com um módulo; sorteio do mês, publicação e outro módulo 403 `ROSTER_MONTH_LEADERSHIP_REQUIRED` | 200 / 403 | **LOCAL PASS** no código. **HOSTED BLOCKED** no Neon QA |
| LIDER_MODULO | Convite ao próprio módulo, aceite, convite ao módulo alheio e recusa de escala | 0 convites de módulo | convite 201; aceite 201; módulo alheio 403 `ROSTER_MODULE_FORBIDDEN`; recusa de escala do Louvor 201 e status `DECLINED`. Sem e-mail e sem WhatsApp | 201 / 403 | **LOCAL PASS** |

O painel local, depois da API, mostra a despesa "QA-PERSONA-B-20261123 despesa sintetica de papel" como "Aprovada pelo pastor" (R$ 45,00). A fila pastoral fica com 0 pendentes, que é o estado posterior à aprovação. Louvor exibe o culto de 04/03/2027 publicado com integrante sintético. Atmosfera em março/2027 lista cultos publicados de todas as equipes e os botões de gerar e publicar o mês. O líder de módulo vê só a equipe Recepção e não recebe esses botões.

## Evidências

Capturas em `docs/qa/evidence/persona-b-20261123/`:

- `hosted-sso-1440.png` — SSO da Vercel, HOSTED BLOCKED
- `local-login-1440.png` — gate local, sem sessão
- `tesouraria-1440.png` e `tesouraria-390.png` — despesa aprovada pelo pastor
- `pastor-1440.png` e `pastor-390.png` — fila pastoral depois da aprovação
- `louvor-1440.png` e `louvor-390.png` — escala publicada
- `atmosfera-1440.png`, `atmosfera-marco-1440.png` e `atmosfera-390.png` — mês da Atmosfera
- `modulo-1440.png`, `modulo-marco-390.png` e `modulo-390.png` — somente Recepção
- `membro-tesouraria-1440.png` e `membro-tesouraria-390.png` — acesso negado

O roteiro que produziu o HTTP e o banco local está em `qa/persona-b-20261123/run-local.mjs`. Ele recusa qualquer URL que não seja Postgres em localhost e recusa identificadores de Neon, HML ou produção. `F11_MFA_BLOCKING` ficou desligado só nesse processo local; a API QA hospedada continua com `mfaBlocking=true`.

## Correção de produto

Nenhuma falha de produto foi reproduzida. O primeiro classificador local marcou a tesouraria como FAIL porque exigia saldo bancário prévio e um Excel ZIP. A releitura dos mesmos bytes confirma saldo inicial zero, saldo final -4500 centavos e planilha SpreadsheetML válida. Não há PR de correção de código.

## Lacunas que continuam abertas na #309

- UI hospedada das três personas: **BLOCKED** pelo SSO da Vercel.
- Jornada autenticada na API QA e no Neon `br-twilight-bonus-b6moawk7`: **BLOCKED** sem sessão autorizada. Não foi declarada como PASS.
- Líder de módulo no QA compartilhado: **BLOCKED** enquanto `ministry_roster_module_leaders=0` e não existir concessão feita por um fluxo de produto, não por SQL direto no banco compartilhado.
