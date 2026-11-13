# Relatório do reteste — previa/rf1-v1

Commit lido: `935fd53e8187b840084a845e418dcb06cbd13956`.
Mensagem: `fix(preview): retirar nome técnico Church OS do estúdio editorial`.
Branch: `previa/rf1-v1`. A ponta dessa branch é esse SHA.
Não é a main. A main continua em `6c43aea`, que foi o alvo da #174.

Deployment nomeado pelo pedido: `dpl_AiFBhKCKAjuZp4qxmKzPC46FV3HA`, projeto `id-riacho1-web-hml`.
O objeto desse deployment não foi lido. `GET https://api.vercel.com/v13/deployments/dpl_AiFBhKCKAjuZp4qxmKzPC46FV3HA` respondeu **403 missingToken**. `readyState` segue desconhecido. SSO não foi desligado.

## O que o alias fez

Em 2026-11-10T17:55:45Z, `GET https://id-riacho1-web-hml.vercel.app/` respondeu **302** para `https://vercel.com/sso-api`, com o corpo `Protected by Vercel Authentication`. O nonce da URL não entra neste relatório.

Na #174 o mesmo alias respondia **503 DEPLOYMENT_PAUSED**. Agora a barreira é o login da Vercel. Isso mostra que o alias não está mais na pausa anterior. Não mostra que este deployment está READY, nem que serve o SHA `935fd53`, nem que alguma jornada funciona.

Capturas do login, em 1440 e 390: `qa/rf1-v1-reteste/evidence/preview-sso-1440.png` e `preview-sso-390.png`. Nenhuma credencial foi digitada.

## Contagem

A #174 registrou **13 FAIL** e **9 BLOCKED** no Pages `6c43aea`. Esses 22 itens foram relidos.

Esta rodada: **0 PASS**, **3 FAIL**, **19 BLOCKED**.

Nenhum PASS. A prévia não entregou HTML da igreja. Ausência de SSO ou de senha HML não foi convertida em FAIL. A API HML e o banco não foram chamados. Nenhuma senha foi impressa ou resetada. `PUBLICADOR_SITE` não foi tentado.

| Agora | IDs |
|---|---|
| FAIL | RF1-PES-CTA, RF1-LIMPEZA, RF1-CRD-409 |
| BLOCKED | os outros 19 |

A tabela completa está em `qa/rf1-v1-reteste/reports/matriz.md`.

## Três falhas que não dependem de abrir a prévia

**RF1-PES-CTA.** O ramo HML de secretaria ainda tem um botão só: “Cadastrar e iniciar admissão”. O outro ramo tem “Cadastrar pessoa” e “Iniciar admissão sintética”. Nenhum dos dois mostra os dois rótulos pedidos. O commit `8a0cc30` passa a manter nome e e-mail quando a gravação falha; essa preservação não foi exercida na tela e não separa os botões.

**RF1-CRD-409.** A rota de carteirinha monta `ChurchCredentials`. `credentialFailure` ainda devolve “Já existe uma carteirinha ativa para esta matrícula.” para qualquer 409. A diferenciação de três textos ficou em `HmlPhaseOne`, componente que essa página não monta. O HTTP 409 não foi disparado.

**RF1-LIMPEZA.** As dez páginas saíram da árvore: `app/demo`, `app/operacao`, `contato`, `design-system`, `ministerios`, `ministerios/[slug]`, `novidades`, `status`, `visita` e `w1-estudio`. `/a-igreja/` e `/eventos/` ficaram como redirecionamento. A suíte do mesmo SHA não acompanhou a exclusão. O Actions `42869490913` terminou com Test em failure e Build ignorado. Os testes ainda abrem `demo/page.tsx`, `ministerios/page.tsx`, `ministerios/[slug]/page.tsx` e `w1-estudio/page.tsx`. `authenticatedLanding` de um líder devolve `/app/`, e o teste ainda espera `/app/operacao/`. O `verify-export.mjs` foi atualizado e não chegou a rodar, porque o build não rodou.

`W1PortalStudio.tsx` e `DasOperations.tsx` continuam no repositório sem página. A descrição de `layout.tsx` ainda diz “portal de gestão Church OS”. O título de `/app/editorial/` no código passou a “Conteúdo e mídia — ID Riacho 1”.

## O que o código sugere e a prévia não confirmou

Não vira PASS.

- O menu público do SHA usa âncoras de Início, Quem somos e Agenda. Login fica em `/login/`.
- Os arquivos montados da home não importam o chat do Riachinho.
- A legenda “IMAGEM ILUSTRATIVA” no CSS do commit é branca, 12px, sobre `#101f1f`. Numa fixture local, o contraste calculado foi **16,97:1** e o botão “Mostrar” mediu **60,39×44 px**. A fixture está em `css-fixture-1440.png`. Na #174 a página publicada media 1,48:1 e 32 px de altura. A prévia desta rodada não mostrou nem a home nem o login da igreja.
- “Seu acesso é individual” não está em `LoginScreen.tsx`. O teste desse componente passou no Actions.
- `/status/` saiu. O teste estático do shell espera um único “Sair”. O sino de avisos só entra com sessão pronta.
- “Ministérios e operação” ficou com `surface: "retired"` e some de `shellAreasForRoles`. “Meu Espaço” ficou com `surface: "member"`.
- Louvor e Atmosfera seguem em `/app/servir/`. Os outros ministérios apontam para `/app/ministerios/?ministry=<id>`. Sem sessão, o submenu não busca a lista. Não houve regressão observada na prévia; a jornada também não foi provada.

`NEXT_PUBLIC_HML_ENABLED` no deployment não foi lido. Com a flag desligada e sem sessão, o shell entra em modo preview e pode mostrar módulos sem autenticação da aplicação. Com a flag ligada, o painel é `PersonaHome` e a secretaria é `HmlPhaseOne`. As duas possibilidades ficam abertas até alguém do time ler o ambiente, sem desligar o SSO.

## Dashboard e ministérios

Não há captura do dashboard novo nem do menu de ministérios logado. Grep em `PersonaHome` e `ChurchDashboard` não encontrou cartão de QA, RFC, endpoint ou DAS. Isso não substitui a tela. A lentidão do painel não foi medida.

O líder deixa de cair em `/app/operacao/`, página removida, e passa a cair em `/app/`. O teste antigo que exige a rota removida falha. Isso é suíte desatualizada, não uma jornada vista no browser.

## O que falta para uma rodada com PASS

Uma pessoa do time `team_CMNbcFRquQfcR2yWEO7UbsOS` precisa ler `readyState` de `dpl_AiFBhKCKAjuZp4qxmKzPC46FV3HA` e abrir o alias já autenticada na Vercel. Sem isso, a próxima execução deve continuar BLOCKED por acesso. READY, se vier, não fecha ficha, carteirinha, 409 ao vivo nem o menu de cada ministério.
