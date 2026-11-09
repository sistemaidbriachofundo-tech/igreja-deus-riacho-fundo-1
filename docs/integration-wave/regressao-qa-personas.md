# Regressão de QA por persona

Fonte do número 86 PASS / 3 FAIL / 2 BLOCKED: PR #104, matriz gerada em 2026-11-09T16:39:27Z, suíte `qa/persona-e2e` contra a main com seed fictício. Esta frente não reexecutou o navegador. Copiar o número para o conjunto #103+#91 seria aprovação simulada.

Login frio naquela execução ficou entre 983 ms e 1169 ms. Login quente, entre 453 ms e 554 ms. Diretório autenticado, entre 857 ms e 1040 ms. Módulo Secretaria, entre 470 ms e 573 ms. São amostras únicas, sem meta inventada.

## Resultado por persona na main

| Persona | O que a matriz cobriu | Resultado na main | O que falta depois de integrar |
|---|---|---|---|
| PUBLICAÇÃO | `/`, `/app/`, `/app/membros/`, `/app/secretaria/` sem sessão; botão de entrar desabilitado | PASS de gate. Não aprova módulo | Repetir com o `basePath` do Pages e com base path vazio |
| SECRETARIA | Login frio e quente; busca de pessoa sintética; APIs de pessoas, memberships, ministérios; 403 em pastoral e ledger | PASS de sessão e de API | Os 3 FAIL de interface continuam até a ficha existir |
| SECRETARIA | Abrir, editar e reabrir ficha na interface | FAIL | Plano em `plano-tres-fail.md`. API dessas três etapas passou |
| PASTOR | Login; pastoral 200; ledger, memberships e credencial própria 403 | PASS na main | Repetir depois do guard do #101, que tira aprovação pastoral do admin técnico |
| TESOURARIA | Login; ledger 200; pessoas, pastoral, CMS e ministérios 403 | PASS na main | Repetir depois do #101. #96 ainda sem PR |
| LÍDER | Login; ministérios 200; ficha geral, pastoral, ledger e CMS 403 | PASS na main | #97 ainda sem PR |
| MEMBRO | Login; a própria ficha 200; ficha de outra pessoa, busca, pastoral e ledger 403 | PASS na main | #98 ainda sem PR |
| EDITOR | Papel `EDITOR_SITE` no catálogo | BLOCKED | Seed sem usuário sintético. Login tentado no #104 respondeu 401. #101 não cria a conta |
| ADMIN TÉCNICO | Login; pessoas, memberships, ministérios e CMS 200; pastoral e ledger 403 | PASS na main | Confirmar de novo com `ACCESS_POLICY_MODE` estrito do #101. O resumo de indicadores ainda pode mostrar `pastoralOpen` |

## Telas logadas em 360, 768 e 1440

O #104 mediu overflow horizontal 0 px na main, com sessão de Secretaria:

- gate de `/app/secretaria/` nas três larguras (é a tela de acesso, não o módulo);
- diretório de membros autenticado nas três larguras;
- módulo Secretaria autenticado nas três larguras.

Capturas de pastor, tesouraria e admin naquela suíte estão numa largura só. A ficha não existe, então 360/768/1440 da ficha está BLOCKED.

#102 declara capturas da vitrine `/design-system/` nas três larguras, com CSS module e sem mexer no shell. Isso não regressa o painel logado. Depois do #103, repetir as três larguras em Visão, Membros, Secretaria e Operação, porque o menu passa a interceptar o clique e o markup da âncora muda. Critério: `scrollWidth` igual a `clientWidth`, alvo de toque utilizável no menu móvel, e URL com o `basePath` configurado.

## O que reexecutar em cada marco

| Marco | Casos | Estado hoje |
|---|---|---|
| Main, já feito pelo #104 | Matriz de persona e três larguras do diretório | 86 PASS, 3 FAIL, 2 BLOCKED |
| Depois do #103 sozinho | Login frio, login quente, F5 em `/app/membros/`, clique Membros → Secretaria sem recarga, `basePath` dos dois modos, 360/768/1440 do shell | BLOCKED. Não executado nesta frente |
| Depois do PR da #91 sobre o #103 | Os três FAIL de ficha, mais 401/403/404/409/timeout sem perder rascunho nem token fora do 401 | BLOCKED. #91 sem branch |
| Depois do #101 | Negativos já PASS na main: admin sem pastoral e sem ledger; tesouraria sem pessoas; membro só na própria ficha; editor sem pessoas | BLOCKED até a suíte rodar no branch do #101 |
| #95 a #98 | Fora de escopo até cada PR existir e a onda 0 estar revisada | BLOCKED. Agentes em execução sem diff publicado |
