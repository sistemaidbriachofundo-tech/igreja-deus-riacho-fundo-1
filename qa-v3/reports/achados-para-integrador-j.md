# Achados para o integrador J (#154)

Issue de QA: #153. Epic: #144. Site: https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/. SHA Pages `3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3`. SHA API `3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3`.

**NÃO APROVADA.** 0 FAIL P0, 2 FAIL P1, 24 BLOCKED críticos. A release não segue para homologação humana como pronta.

Esta frente não altera produto. Os itens abaixo são para J corrigir ou desbloquear. Nenhum merge e nenhum deploy foram feitos por I.

## SG-T05 — BLOCKED

Login das 8 personas sintéticas

Nenhuma das 8 contas sintéticas autenticou. HTTP: ADMIN 401; SECRETARIA 401; PASTOR 401; TESOURARIA 401; LIDER 401; MEMBRO 401; EDITOR 401; PUBLICADOR (não está no seed) 401. A senha usada foi a do seed local documentado, uma tentativa por conta. O secret da HML não está neste agente e a senha não foi resetada.

Passos: POST /auth/login uma vez por persona sintética. Sem segunda senha e sem reset.

## SG-T07 — BLOCKED

Matriz 403 por persona

A matriz 403 por persona não rodou porque o login HML não abriu sessão.

Passos: Repetir com QA_DEMO_PASSWORD da HML, sem reset.

## SG-T08 — BLOCKED

Secretaria busca pessoa

A busca de pessoa exige a sessão de Secretaria. O login sintético não abriu.


## SG-T09 — BLOCKED

Secretaria edita e reabre o mesmo personId

O ciclo editar e reabrir o mesmo personId não foi executado. Também não houve PATCH: a frente I não reescreve ficha da HML sem rollback combinado com J.


## SG-T10 — BLOCKED

Clique em carteirinha abre a credencial

A rota /app/membros/carteirinha/ mostrou o login. Não havia link Carteirinhas para abrir a credencial.

Passos: Abrir /app/membros/carteirinha/ em 390 px e procurar Carteirinhas.
Evidência: `qa-v3/evidence/depois-carteirinha-390.jpg`.

## SG-T11 — BLOCKED

Carteirinha frente, verso, PDF e QR

Frente, verso, PDF e QR não foram exercitados com sessão. O gate não mostra esses artefatos.

Evidência: `qa-v3/evidence/depois-carteirinha-390.jpg`.

## SG-T12 — BLOCKED

Revogação de credencial e QR inválido

Nenhuma credencial existente foi revogada. O POST anônimo de revogação não é o fluxo positivo e a HML não deve perder QR sintético nesta rodada.


## SG-T13 — BLOCKED

Vínculo formal pessoa → ministério

Sem sessão não há vínculo formal a gravar. A rota interna caiu no gate. Slugs públicos da API: atmosfera, adolescentes, homens, jovens, mulheres.


## SG-T14 — BLOCKED

Escala do ministério

A escala autenticada não foi criada. Sem sessão, Meu Espaço e o vínculo interno não listam atribuição.


## SG-T15 — BLOCKED

Meu Espaço confirma ou recusa a própria escala

Meu Espaço pede entrada e não oferece confirmar ou recusar.


## SG-T21 — BLOCKED

Editor recebe 403 ao publicar; publicador publica

Editor e publicador não autenticaram. A conta PUBLICADOR_SITE não está no seed versionado.


## SG-T22 — BLOCKED

Tesouraria idempotente sem lançamento duplicado

A rota /app/tesouraria/ caiu no login. Nenhum lançamento foi gravado e a dupla submissão não foi executada.

Passos: Abrir /app/tesouraria/ sem sessão e não enviar formulário.
Evidência: `qa-v3/evidence/antes-tesouraria-1440.jpg`.

## SG-T23 — BLOCKED

Tesouraria 403 para quem não é do caixa

O 403 de tesouraria por persona fica bloqueado junto com o login. O GET anônimo de /ledger/accounts está em SG-T06.


## SG-T25 — BLOCKED

Dashboards mostram números vindos da API

O painel autenticado com números da API não abriu. A tesouraria sem sessão não consulta o ledger.

Passos: Abrir /app/ e /app/tesouraria/.
Evidência: `qa-v3/evidence/antes-tesouraria-1440.jpg`.

## SG-T26 — BLOCKED

Sair encerra a sessão

O gate de login cobre /app/ antes do shell. Sair não foi exibido e a sessão não existia.

Passos: Abrir /app/ sem sessão e procurar Sair.
Evidência: `qa-v3/evidence/antes-painel-1440.jpg`.

## UX-01 — FAIL P1

Início: contraste e reflow

home HTTP 200. Contraste 1.48:1, mínimo 4.5, “IMAGEM ILUSTRATIVA”.

Evidência: `qa-v3/evidence/antes-home-1440.jpg`.

## UX-03 — FAIL P2

Agenda

agenda HTTP 200. Contraste 3.1:1, mínimo 4.5, “AGENDA PÚBLICA”.


## UX-V01 — BLOCKED

Sidebar recolhe, persiste e expande

Sem sessão, /app/ mostra só o login. A sidebar não foi renderizada, então recolher, persistir e expandir não foram executados.

Passos: Abrir /app/ sem sessão e, se o shell aparecer, procurar o controle de recolher.
Evidência: `qa-v3/evidence/antes-painel-390.jpg`.

## UX-V02 — BLOCKED

Ministérios expande até Homens

O submenu autenticado não apareceu porque o gate cobre /app/. A página pública /ministerios/homens/ respondeu HTTP 200. API pública: atmosfera, adolescentes, homens, jovens, mulheres.

Passos: Sem sessão, abrir /app/ e também /ministerios/homens/.
Evidência: `qa-v3/evidence/antes-homens-390.jpg`.

## UX-V03 — BLOCKED

Sair discreto no shell autenticado

O controle Sair fica no shell, que o gate não mostra sem sessão.

Passos: Abrir /app/ sem sessão e procurar Sair.
Evidência: `qa-v3/evidence/antes-painel-1440.jpg`.

## UX-V06 — FAIL P2

Homologação identificada com discrição

A tela que substitui /app/* não identifica a homologação.

Evidência: `qa-v3/evidence/antes-painel-390.jpg`.

## UX-V07 — BLOCKED

Frente da carteirinha abre ao clique

Não havia carteirinha para abrir: /app/membros/carteirinha/ exibiu só o login.

Evidência: `qa-v3/evidence/depois-carteirinha-390.jpg`.

## UX-V08 — BLOCKED

Verso da carteirinha

O verso não foi exibido.


## UX-V09 — BLOCKED

PDF da carteirinha

O PDF não foi baixado.


## UX-V10 — BLOCKED

QR da carteirinha

O QR não foi exibido.


## UX-V11 — BLOCKED

Dashboard com números da API, sem saldo ilustrado como real

A leitura da tesouraria não trouxe o contrato esperado de números. O painel /app/ está no gate e não mostra indicador numérico da API.

Passos: Abrir /app/tesouraria/ sem sessão e ler medidas e ilustração.
Evidência: `qa-v3/evidence/antes-tesouraria-1440.jpg`.

## UX-V12 — FAIL P2

Sem rolagem horizontal de 320 a 1920

ministerios-publicos@320 (387>320); ministerios-publicos@360 (387>360)

Evidência: `qa-v3/evidence/antes-home-320.jpg`.

## UX-V13 — FAIL P2

Alvos de toque com 44 px

Controles abaixo de 44 px: login-390 “Mostrar senha” 32px; login-1440 “Mostrar senha” 32px; painel-390 “Mostrar senha” 32px; painel-1440 “Mostrar senha” 32px; membros-390 “Mostrar senha” 32px; membros-1440 “Mostrar senha” 32px.

Evidência: `qa-v3/evidence/antes-home-390.jpg`.

## UX-V14 — FAIL P1

Contraste de texto comum ≥ 4,5:1

Pior contraste fora de fotos: home 1.48:1 (#E3DFD0 sobre #CFB58D) em “IMAGEM ILUSTRATIVA”.

Evidência: `qa-v3/evidence/antes-home-1440.jpg`.

## UX-V18 — BLOCKED

404 ou 501 visível não conta como sucesso

O gate visível não mostra 404, 501 nem BLOCKED. O shell autenticado, onde esses rótulos podem existir, não foi aberto.

Passos: Abrir /app/ sem sessão e ler o texto visível.
Evidência: `qa-v3/evidence/antes-painel-1440.jpg`.
