# Matriz QA v3 — frente I

Executada em 2026-11-10T01:56:27.788Z.

- Site: https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/
- API: https://id-riacho1-api-hml.vercel.app
- SHA do Pages (`release.json`): `3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3`
- SHA da API (`/meta`): `3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3`
- SHA do git desta branch: `fdc545829bf3a223eb7963dd3615ab699c0b2fc3`
- Decisão para o integrador J (#154): **NÃO APROVADA**. 0 FAIL P0, 2 FAIL P1, 24 BLOCKED críticos. A release não segue para homologação humana como pronta.

Contagens: **15 PASS**, **6 FAIL**, **29 BLOCKED**.

PASS só entra quando o passo foi executado de verdade. 404 ou 501 visível no modo usuário permanece FAIL. Jornada sem sessão ou sem a senha HML fica BLOCKED, não PASS.

| ID | Resultado | Severidade | Item | Evidência |
|---|---|---|---|---|
| SG-T01 | PASS | — | Home oficial responde e identifica a igreja. Home HTTP 200, título “Igreja de Deus — Riacho Fundo I”. | `qa-v3/evidence/antes-home-1440.jpg` |
| SG-T02 | PASS | — | Menu público limitado a Início, Quem somos, Agenda e Login. O menu público mostra só Início, Quem somos, Agenda e Login. Rótulos lidos: Início, Quem somos, Agenda, Login ID Riacho 1 — abrir tela de e-mail e senha, Login. | `qa-v3/evidence/antes-home-1440.jpg` |
| SG-T03 | PASS | — | API HML /health. GET /health HTTP 200. | — |
| SG-T04 | PASS | — | Pages release.json e API /meta no mesmo sourceSha. Pages e API estão em 3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3. | — |
| SG-T05 | BLOCKED | — | Login das 8 personas sintéticas. Nenhuma das 8 contas sintéticas autenticou. HTTP: ADMIN 401; SECRETARIA 401; PASTOR 401; TESOURARIA 401; LIDER 401; MEMBRO 401; EDITOR 401; PUBLICADOR (não está no seed) 401. A senha usada foi a do seed local documentado, uma tentativa por conta. O secret da HML não está neste agente e a senha não foi resetada. | — |
| SG-T06 | PASS | — | Rotas protegidas sem sessão respondem 401. 12 rotas protegidas responderam 401 sem sessão. | — |
| SG-T07 | BLOCKED | — | Matriz 403 por persona. A matriz 403 por persona não rodou porque o login HML não abriu sessão. | — |
| SG-T08 | BLOCKED | — | Secretaria busca pessoa. A busca de pessoa exige a sessão de Secretaria. O login sintético não abriu. | — |
| SG-T09 | BLOCKED | — | Secretaria edita e reabre o mesmo personId. O ciclo editar e reabrir o mesmo personId não foi executado. Também não houve PATCH: a frente I não reescreve ficha da HML sem rollback combinado com J. | — |
| SG-T10 | BLOCKED | — | Clique em carteirinha abre a credencial. A rota /app/membros/carteirinha/ mostrou o login. Não havia link Carteirinhas para abrir a credencial. | `qa-v3/evidence/depois-carteirinha-390.jpg` |
| SG-T11 | BLOCKED | — | Carteirinha frente, verso, PDF e QR. Frente, verso, PDF e QR não foram exercitados com sessão. O gate não mostra esses artefatos. | `qa-v3/evidence/depois-carteirinha-390.jpg` |
| SG-T12 | BLOCKED | — | Revogação de credencial e QR inválido. Nenhuma credencial existente foi revogada. O POST anônimo de revogação não é o fluxo positivo e a HML não deve perder QR sintético nesta rodada. | — |
| SG-T13 | BLOCKED | — | Vínculo formal pessoa → ministério. Sem sessão não há vínculo formal a gravar. A rota interna caiu no gate. Slugs públicos da API: atmosfera, adolescentes, homens, jovens, mulheres. | — |
| SG-T14 | BLOCKED | — | Escala do ministério. A escala autenticada não foi criada. Sem sessão, Meu Espaço e o vínculo interno não listam atribuição. | — |
| SG-T15 | BLOCKED | — | Meu Espaço confirma ou recusa a própria escala. Meu Espaço pede entrada e não oferece confirmar ou recusar. | — |
| SG-T16 | BLOCKED | — | Evento criado e publicado. Nenhum evento foi criado na HML. A agenda pública foi apenas lida. | — |
| SG-T17 | BLOCKED | — | Inscrição em evento. Nenhuma inscrição foi enviada. | — |
| SG-T18 | BLOCKED | — | Check-in. Nenhum check-in foi registrado. | — |
| SG-T19 | BLOCKED | — | Relatório CSV ou PDF de presença. CSV e PDF de presença não foram gerados. Não há sessão de gestão de evento nesta execução. | — |
| SG-T20 | BLOCKED | — | CMS salva rascunho. O estúdio pede sessão e o rascunho não foi salvo. | — |
| SG-T21 | BLOCKED | — | Editor recebe 403 ao publicar; publicador publica. Editor e publicador não autenticaram. A conta PUBLICADOR_SITE não está no seed versionado. | — |
| SG-T22 | BLOCKED | — | Tesouraria idempotente sem lançamento duplicado. A rota /app/tesouraria/ caiu no login. Nenhum lançamento foi gravado e a dupla submissão não foi executada. | `qa-v3/evidence/antes-tesouraria-1440.jpg` |
| SG-T23 | BLOCKED | — | Tesouraria 403 para quem não é do caixa. O 403 de tesouraria por persona fica bloqueado junto com o login. O GET anônimo de /ledger/accounts está em SG-T06. | — |
| SG-T24 | PASS | — | Nenhum envio externo de mensagem ou Pix. Não há botão de WhatsApp, e-mail externo ou Pix. POST /channels/outbox sem sessão respondeu 401. | — |
| SG-T25 | BLOCKED | — | Dashboards mostram números vindos da API. O painel autenticado com números da API não abriu. A tesouraria sem sessão não consulta o ledger. | `qa-v3/evidence/antes-tesouraria-1440.jpg` |
| SG-T26 | BLOCKED | — | Sair encerra a sessão. O gate de login cobre /app/ antes do shell. Sair não foi exibido e a sessão não existia. | `qa-v3/evidence/antes-painel-1440.jpg` |
| UX-01 | FAIL | P1 | Início: contraste e reflow. home HTTP 200. Contraste 1.48:1, mínimo 4.5, “IMAGEM ILUSTRATIVA”. | `qa-v3/evidence/antes-home-1440.jpg` |
| UX-02 | PASS | — | Quem somos. Quem somos carregou. h1: Mais que uma igreja. Uma família.. | — |
| UX-03 | FAIL | P2 | Agenda. agenda HTTP 200. Contraste 3.1:1, mínimo 4.5, “AGENDA PÚBLICA”. | — |
| UX-04 | PASS | — | Login publicado. Login HTTP 200. E-mail e senha estão na tela. | `qa-v3/evidence/antes-login-390.jpg` |
| UX-05 | PASS | — | Gate de /app/secretaria sem sessão. Sem sessão, /app/secretaria/ mostra o acesso e não a lista. | — |
| UX-06 | PASS | — | Erro de credencial não ecoa a senha. O alerta não devolve a senha. HTTP 401. Mensagem: E-mail ou senha não autorizados. Confira seus dados. | `qa-v3/evidence/depois-login-erro-390.jpg` |
| UX-V01 | BLOCKED | — | Sidebar recolhe, persiste e expande. Sem sessão, /app/ mostra só o login. A sidebar não foi renderizada, então recolher, persistir e expandir não foram executados. | `qa-v3/evidence/antes-painel-390.jpg` |
| UX-V02 | BLOCKED | — | Ministérios expande até Homens. O submenu autenticado não apareceu porque o gate cobre /app/. A página pública /ministerios/homens/ respondeu HTTP 200. API pública: atmosfera, adolescentes, homens, jovens, mulheres. | `qa-v3/evidence/antes-homens-390.jpg` |
| UX-V03 | BLOCKED | — | Sair discreto no shell autenticado. O controle Sair fica no shell, que o gate não mostra sem sessão. | `qa-v3/evidence/antes-painel-1440.jpg` |
| UX-V04 | PASS | — | Canais de Comunicação fora do menu principal. “Canais de Comunicação” não aparece no menu principal nem na busca de módulos. | — |
| UX-V05 | PASS | — | Telas usuais sem demo, roster, endpoint ou schema. O portal e o gate de /app/ não mostram demo, roster, endpoint ou schema. O shell atrás do login não entrou na amostra. | `qa-v3/evidence/antes-painel-1440.jpg` |
| UX-V06 | FAIL | P2 | Homologação identificada com discrição. A tela que substitui /app/* não identifica a homologação. | `qa-v3/evidence/antes-painel-390.jpg` |
| UX-V07 | BLOCKED | — | Frente da carteirinha abre ao clique. Não havia carteirinha para abrir: /app/membros/carteirinha/ exibiu só o login. | `qa-v3/evidence/depois-carteirinha-390.jpg` |
| UX-V08 | BLOCKED | — | Verso da carteirinha. O verso não foi exibido. | — |
| UX-V09 | BLOCKED | — | PDF da carteirinha. O PDF não foi baixado. | — |
| UX-V10 | BLOCKED | — | QR da carteirinha. O QR não foi exibido. | — |
| UX-V11 | BLOCKED | — | Dashboard com números da API, sem saldo ilustrado como real. A leitura da tesouraria não trouxe o contrato esperado de números. O painel /app/ está no gate e não mostra indicador numérico da API. | `qa-v3/evidence/antes-tesouraria-1440.jpg` |
| UX-V12 | FAIL | P2 | Sem rolagem horizontal de 320 a 1920. ministerios-publicos@320 (387>320); ministerios-publicos@360 (387>360) | `qa-v3/evidence/antes-home-320.jpg` |
| UX-V13 | FAIL | P2 | Alvos de toque com 44 px. Controles abaixo de 44 px: login-390 “Mostrar senha” 32px; login-1440 “Mostrar senha” 32px; painel-390 “Mostrar senha” 32px; painel-1440 “Mostrar senha” 32px; membros-390 “Mostrar senha” 32px; membros-1440 “Mostrar senha” 32px. | `qa-v3/evidence/antes-home-390.jpg` |
| UX-V14 | FAIL | P1 | Contraste de texto comum ≥ 4,5:1. Pior contraste fora de fotos: home 1.48:1 (#E3DFD0 sobre #CFB58D) em “IMAGEM ILUSTRATIVA”. | `qa-v3/evidence/antes-home-1440.jpg` |
| UX-V15 | PASS | — | Zoom 200% sem cortar o conteúdo. Zoom 200% em Início (1440) e no painel (390) não criou rolagem horizontal. | `qa-v3/evidence/depois-zoom-home.jpg` |
| UX-V16 | PASS | — | Menu móvel abre e Escape fecha. Menu móvel aberto=1; depois do Escape aberto=0. | `qa-v3/evidence/depois-menu-390.jpg` |
| UX-V17 | PASS | — | Sem botão de WhatsApp, e-mail externo ou Pix. Não há botão de WhatsApp, e-mail externo ou Pix. POST /channels/outbox sem sessão respondeu 401. | — |
| UX-V18 | BLOCKED | — | 404 ou 501 visível não conta como sucesso. O gate visível não mostra 404, 501 nem BLOCKED. O shell autenticado, onde esses rótulos podem existir, não foi aberto. | `qa-v3/evidence/antes-painel-1440.jpg` |
