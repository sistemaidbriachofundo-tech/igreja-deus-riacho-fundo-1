# Auditoria visual e de acessibilidade por perfil

Leitura da main integrada em 9 de novembro de 2026. Esta frente não alterou frontend, design system, API, banco nem credenciais. Nenhuma tela ausente foi substituída por mock.

O círculo com a letra N que aparece em algumas capturas é o indicador do `next dev`. Não faz parte da interface publicada.

## Resumo

| Veredito | Casos |
| --- | --- |
| PASS | UX-02, UX-04, UX-05, UX-06 |
| FAIL | UX-01, UX-03 |
| BLOCKED | UX-07, UX-08, UX-09, UX-10, UX-11, UX-12, UX-13 |

P2 não reprova o caso. A matriz completa está em `qa/ux-personas/reports/matriz.md`.

## O que foi exercitado

Viewports 360, 390, 768, 1440 e 1920. Zoom 200% medido como largura CSS pela metade (360 px viram 180 px). Teclado no portal e no login. Formulário, alerta, estado vazio e gate sem sessão.

Não houve rolagem horizontal nessas cinco larguras. Em 320 px CSS, que é o reflow de referência, Início, Quem somos, Agenda e Login também cabem.

| Caso | Veredito | Leitura |
| --- | --- | --- |
| UX-01 Início | FAIL P1 | Texto de apoio em #67797E sobre #EDF1EA mede 3,98. O vazio da agenda em #697B7E sobre #E9ECE6 mede 3,72. A 180 px CSS, “encontros.” é cortado e “Comunhão” encosta em “Serviço”. |
| UX-02 Quem somos | PASS | P2: olhos e numerais em bronze sobre fundo claro ficam entre 1,7 e 3,7. O fluxo cabe e tem um h1. |
| UX-03 Agenda | FAIL P1 | O mesmo texto #67797E mede 4,24 sobre #F7F7F3. O estado vazio “Programação em atualização” aparece, sem eventos inventados. |
| UX-04 Login na publicação | PASS | O aviso de acesso desligado está visível e o envio não dispara. E-mail e senha têm label. P2: “Mostrar senha” tem 32 px de altura; a fundação pede 44. |
| UX-05 Gate /app/secretaria | PASS | Sem sessão a rota mostra o login, não a secretaria. O mesmo P2 do botão de revelar senha. |
| UX-06 Erro sintético | PASS | Com o acesso ligado e a API local desligada, `qa.sintetico@example.test` recebe “Não foi possível conectar ao serviço de acesso.” A senha não volta no alerta e o campo é limpo. |
| UX-07 a UX-13 | BLOCKED | Ver abaixo. |

## Recomendações para quem é dono da tela

Não corrigi o CSS. A frente do portal pode:

1. Escurecer `.agendaHeader > p` (`#67797E`) e `.fallback p` (`#697B7E`) até razão 4,5 sobre o fundo claro.
2. Trocar o bronze de `h2 em` (`#b48850`, razão 2,97, abaixo até do limiar de texto grande) e os olhos dourados sobre branco (`#E8C180`, razão 1,70). A fundação #102 já recusa ouro sobre creme.
3. Deixar o título “Próximos encontros.” quebrar em 180 px CSS e manter espaço entre os valores.
4. Subir “Mostrar senha” para 44 px de altura.

O estado “Consultando eventos publicados…” não foi fotografado. Ele só existe com `NEXT_PUBLIC_PORTAL_LIVE_ENABLED` e uma API pública. Não liguei esse canal. Fica BLOCKED como subestado. Agenda vazia e agenda indisponível usam o mesmo texto; vale separar o erro da ausência, em P2.

## Teclado, foco e formulário

No Início, Tab alcança os links e o menu de 360 px abre pelo botão “Abrir menu”. Escape fecha o menu quando o foco está nele. O login anuncia erro em `role="alert"`, mantém `lang="pt-BR"` e não ecoa senha. O foco dos campos usa um brilho; o contorno do portal, visto na Agenda, é um anel dourado visível.

## Perfis bloqueados

Não há dashboard de Pastor, Admin, Tesouraria, Líder ou Membro. A secretaria autenticada também não foi aberta.

| Caso | Por que está BLOCKED | O que não foi improvisado |
| --- | --- | --- |
| UX-07 Secretaria | A rota existe, mas o workspace depende de `/auth/me`. Sem sessão ela mostra o login. | Não subi Postgres, não usei credencial e não trouxe a ficha do PR #106. |
| UX-08 Pastor | Não há página do pastor. O cuidado pastoral está em `DasOperations`, atrás da sessão, e o próprio HML marca a integração como pendente. | Não montei um painel pastoral. |
| UX-09 Admin | Não há `/app/admin`. | Não tratei o gate como se fosse o dashboard. |
| UX-10 Tesouraria | Não há rota. `FinanceBoard` só entra em `/app/operacao` depois da sessão. | Não abri o PR #108. |
| UX-11 Líder | O código manda `LIDER_MINISTERIO` para `/app/operacao`, mas essa tela autenticada não foi exercitada. | Não simulei o papel. |
| UX-12 Membro | Não há portal do membro. `/app/demo` fica atrás do mesmo gate. | Não apresentei o demo como área do membro. |
| UX-13 Fundação #102 | `/design-system/` responde 404. Os componentes `ui/` não estão na main. Os tokens foram lidos só no ref do PR. | Não copiei a vitrine. |

## Handoff

Contraste, zoom e o alvo de 44 px pertencem a quem edita o portal e o login. Esta branch para em `qa/ux-personas/` e `docs/ux-personas/`.
