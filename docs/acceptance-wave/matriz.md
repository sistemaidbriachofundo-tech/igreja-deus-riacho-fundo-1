# Matriz da árvore integrada

Execução em 2026-11-09 contra Postgres 16 local e contas `*.demo@example.test`. Sem HML remota. `productApproved` do `reports/run.json` é **false**.

## O que mudou em relação a 86 PASS / 3 FAIL / 2 BLOCKED

A suíte `qa/persona-e2e` do #104, reexecutada sem editar o spec:

| Bloco | Resultado nesta árvore |
|---|---|
| Publicação sem HML (`:3010`) | 7 PASS |
| HML autenticada (`:3000` + API + Postgres) | 80 PASS, 2 FAIL, 2 BLOCKED |
| Soma | **87 PASS, 2 FAIL, 2 BLOCKED** |

O FAIL que saiu foi `SECRETARIA/abrir-ui`: o diretório agora tem o botão **Abrir ficha**. Os dois FAIL que permanecem nessa suíte são `SECRETARIA/editar-ui` e `SECRETARIA/reabrir-ui`. O spec clica e conta `form input` no mesmo instante, antes do `GET /persons/:id` pintar o formulário. O smoke deste harness espera o diálogo, grava a família, fecha, reabre e confere o `GET`. Essa jornada passou. O ajuste do spec é do #104; esta frente não edita `qa/persona-e2e`.

O classificador estático do #107 (`qa/integration-wave/classify.mjs`) continua imprimindo FAIL para as três linhas de ficha. Ele recorta o primeiro `view==="members"` do ternário do `AppShell` (linha 170) e não a tabela da linha 232, onde o botão está. O teste pinado desse PR passa por causa desse recorte. A evidência de navegador desta execução é a que vale para a jornada.

## Smoke estrito — 21 PASS, 3 FAIL, 5 BLOCKED

| Caso | Status | Dono |
|---|---|---|
| Login frio da Secretaria até `/app/` | PASS, 364 ms | [#103](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/pull/103) |
| Buscar Bruno Demo Membro | PASS | [#106](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/pull/106) |
| Abrir ficha | PASS | #106 |
| Editar família, salvar e reler o select | PASS, 167 ms | #106 |
| Fechar e reabrir a mesma ficha | PASS | #106 |
| `GET /persons/demoPersonMembro01` devolve o household gravado | PASS, HTTP 200 | API + Postgres local |
| Restaurar o household do seed | PASS, HTTP 200 | harness |
| Escape fecha o diálogo | PASS | #106 |
| Ficha em 1440 px, overflow 0, título legível | PASS | #106 |
| Ficha em 768 px | **FAIL** — título encoberto pelo cabeçalho, overflow horizontal 0 | #106 |
| Ficha em 360 px | **FAIL** — nome cortado no topo, overflow horizontal 0, botões 306×42 | #106 |
| Membros → Secretaria → Membros sem recarga | PASS, 261 ms, mesmo `runtimeId`, 1 navigation entry | #103 |
| Falha de `/memberships` no refresh preserva o token | **FAIL** — `HmlPhaseOne` chama `clearToken()` para qualquer erro | #106, contrato do #103 |
| `GET /persons/search` sem sessão | PASS, 401 | [#101](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/pull/101) |
| Admin em `/pastoral-cases` e `/ledger/accounts` | PASS, 403 e 403 | #101 |
| Tesouraria em `/persons/search` | PASS, 403 | #101 |
| Membro na ficha de Ana | PASS, 403 | #101 |
| Secretaria na ficha de Bruno | PASS, 200 | API |
| Pastor em `/pastoral-cases` | PASS, 200 | #101 |
| Pastor em `PATCH` da ficha | PASS, 403 | #101 |
| Tesouraria em `/ledger/accounts` | PASS, 200 | #101 |
| Líder na ficha geral | PASS, 403 | #101 |
| Conta `editor.demo@example.test` | **BLOCKED**, login 401 | #101 / seed. Papel existe, usuário não |
| `GET /indicators/summary` com `pastoralOpen` | **BLOCKED**, HTTP 200 e a chave presente | `apps/api/src/indicators` |
| `GET /audit-logs` com metadata cru | **BLOCKED**, HTTP 200. Nesta página não veio metadata não nulo; o service ainda serializa `metadata` quando existe. O corpo não foi copiado | `apps/api/src/audit` |
| Suíte no CI | **BLOCKED** | integrador, `.github/workflows` |
| HML remota | **BLOCKED** | não há ambiente de teste alcançável |
| Vitrine `/design-system/` em 1440, 768 e 360 | PASS, HTTP 200, overflow 0 | [#102](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/pull/102). Não cobre o painel logado |

Nome, e-mail, situação, tipo e observações seguem somente leitura. O PATCH real aceita `isMinor`, `legalGuardianPersonId` e `householdId`. Gravar os outros campos continua **BLOCKED** no contrato, dono da API de pessoas. O `PersonsService.patch` atual não emite 409; o cliente do #106 trata 409 se o contrato passar a emiti-lo. Isso permanece **BLOCKED**, sem ensaio inventado.

## Regressões observadas

1. O gate do #103 preserva o token em falha que não é 401. Dentro de `/app/membros/`, o `catch` de `refresh(stored)` em `HmlPhaseOne` apaga o token quando `/memberships` cai. Captura: `qa/acceptance-wave/reports/evidence/sessao-refresh-falho.png`. A página volta ao formulário **Entre no ID Riacho 1** com o shell ainda montado.
2. Em 768 e 360 o título da ficha fica sob o cabeçalho fixo. Em 1440 o nome aparece inteiro. Capturas: `ficha-768.png`, `ficha-360.png`, `ficha-salva-1440.png`.
3. Não houve regressão nova de 401/403 nas rotas amostradas. Os códigos esperados pela suíte de persona também bateram, inclusive admin sem pastoral e sem ledger.

## Evidência

- `qa/acceptance-wave/reports/run.json`
- `qa/acceptance-wave/reports/persona-hml-matriz.json`
- `qa/acceptance-wave/reports/persona-public-matriz.json`
- capturas em `qa/acceptance-wave/reports/evidence/`

Testes unitários na árvore integrada, sem alterar produto: 17 do dossier, 2 de UI do dossier e 11 da vitrine, todos passando. O `node --test` de `qa/integration-wave/classify.test.mjs` também passou, com o recorte estático descrito acima.
