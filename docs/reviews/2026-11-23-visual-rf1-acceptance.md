# Aceite visual RF1 — 2026-11-23

Auditoria da área autenticada sobre `chatgpt/dev-rc-integrado-20261123` (`b1045df`). Nenhuma alteração em `main`, HML, produção ou DNS. Sem merge.

## O que foi padronizado

A base do painel continua neutra (preto, cinza, branco) com dourado só no destaque. Os controles compartilhados ainda carregavam a paleta verde antiga como cor efetiva de aba, busca, diálogo, alerta e fallback. Esses pontos passaram a usar os tokens do shell.

- Shell: submenu, item e chevron com alvo de 44px; menu hambúrguer visível no celular; sino permanece em 320px; safe-area no topo, na gaveta e na barra inferior; conteúdo sem overflow horizontal.
- Indicadores de membresia e o cabeçalho da ficha 360 deixam o bloco verde grande e usam a faixa preta com dourado.
- Secretaria, tesouraria, ordem de culto, escalas e filtros sobem botões e campos para 44px.
- Riachinho (assistente editorial) usa a mesma base; os estados aberto (verde de status), simulado (âmbar) e fechado (cinza) continuam distinguíveis.
- Portal público, cards de eventos da agenda e a gestão de eventos (`event-management.module.css`, inclusive a agenda) não foram editados.

## Como as capturas foram feitas

O DEV hospedado não foi acessado: SSO/MFA de lá não foi contornado. As telas saíram de um Next local (`NEXT_PUBLIC_HML_ENABLED=true`) com o stub de autenticação só em `127.0.0.1`, senha fora do repositório e e-mails `@example.test`. O stub não implementa as APIs de dados, então vários painéis mostram o estado vazio ou de indisponibilidade. Isso é dado BLOCKED, não falha de layout.

Safari iPhone e Chrome Android físicos: BLOCKED. Não há aparelho nesta sessão. Os breakpoints 1440, 768, 390 e 320 foram Chrome headless desktop.

Suíte web local: `npx vitest run` em `apps/web` — 82 arquivos, 588 testes, incluindo `admin-visual-contract.test.ts`. CI do GitHub corre no PR; o resultado de lá entra quando o workflow terminar.

## Matriz

Legenda: PASS = layout conferido na captura, sem overflow horizontal. BLOCKED = dado ou dispositivo indisponível. O portal público foi só conferido, sem correção.

| Rota | Persona | Breakpoint | Problema | Correção | Resultado | Captura |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | público | 1440, 768, 390, 320 | — | nenhuma | PASS | `publico_inicio_*.png` |
| `/eventos/` | público | 1440, 768, 390, 320 | logo do header com 36px em 320, superfície aprovada | nenhuma | PASS | `publico_agenda_*.png` |
| `/login/` | público | 1440, 768, 390, 320 | — | nenhuma | PASS | `publico_login_*.png` |
| `/app/` | admin | 1440, 390 | fallback verde nos CTAs compartilhados | tokens neutros | PASS | `admin_inicio_*.png` |
| `/app/acessos/` | admin | 1440, 390 | mesma base | tokens neutros | PASS | `admin_acessos_*.png` |
| `/app/gestao-do-sistema/` | admin | 1440, 390 | mesma base | tokens neutros | PASS | `admin_gestao_*.png` |
| `/app/site/` | admin / editor | 1440, 390 | mesma base | tokens neutros | PASS | `admin_midia_*.png` |
| `/app/relatorios/` | admin | 1440, 390 | fallback verde | tokens neutros | PASS | `admin_relatorios_*.png` |
| `/app/` | pastor | 1440, 390 | mesma base | tokens neutros | PASS | `pastor_inicio_*.png` |
| `/app/pastoral/cuidado/` | pastor | 1440, 390 | resumo curto | alvo 44px | PASS | `pastor_cuidado_*.png` |
| `/app/pastoral/ordem-de-culto/` | pastor | 1440, 390 | resumo curto | alvo 44px | PASS | `pastor_culto_*.png` |
| `/app/secretaria/` | secretaria | 1440, 768, 390, 320 | botões abaixo de 44px | altura 44px | PASS | `secretaria_painel_*.png` |
| `/app/secretaria/pessoas/` | secretaria | 1440, 390 | ficha com faixa verde | faixa preta | PASS | `secretaria_pessoas_*.png` |
| `/app/secretaria/aniversariantes/` | secretaria | 1440, 390 | — | shell | PASS | `secretaria_aniversariantes_*.png` |
| `/app/secretaria/indicadores/` | secretaria | 1440, 768, 390, 320 | hero verde alto; API de indicadores ausente no stub | hero neutro | PASS no chrome; BLOCKED no dado | `secretaria_indicadores_*.png` |
| `/app/secretaria/pessoas/mapa/` | secretaria | 1440, 390 | — | shell | PASS | `secretaria_mapa_*.png` |
| `/app/tesouraria/` | tesouraria | 1440, 768, 390, 320 | “marcar pago” baixo | 44px e cor de status | PASS | `tesouraria_painel_*.png` |
| `/app/ministerios/` | líder | 1440, 390 | — | shell | PASS | `lider_ministerios_*.png` |
| `/app/eventos-gestao/` | líder | 1440, 768, 390, 320 | agenda aprovada | não alterada | PASS | `lider_eventos_*.png` |
| `/app/conexao/` | líder | 1440, 390 | — | shell | PASS | `lider_conexao_*.png` |
| `/app/minha-conta/` | membro | 1440, 390 | fallback verde | neutro | PASS | `membro_conta_*.png` |
| `/app/servir/meu-espaco/` | membro | 1440, 390 | — | shell | PASS | `membro_escala_*.png` |
| `/app/eventos/` | membro | 1440, 390 | cards novos preservados | não alterados | PASS | `membro_eventos_*.png` |
| `/app/minha-conta/carteirinha/` | membro | 1440, 390 | — | shell | PASS | `membro_carteirinha_*.png` |
| `/app/convidado/` | convidado | 1440, 390 | — | shell | PASS | `convidado_*.png` |
| `/app/site/` aba Riachinho | editor | 1440, 390 | janela do assistente não monta sem o layout do site no stub | CSS neutro + estados | BLOCKED na janela ao vivo | `riachinho_*.png` |
| shell recolhida | secretaria | 1440 | — | já existia; conferida | PASS | `shell_recolhida_1440.png` |
| gaveta | secretaria | 390 | hambúrguer estava oculto | botão visível | PASS | `shell_drawer_390.png` |
| barra inferior | secretaria | 320 | sino some em 320 | sino permanece; toolbar quebra linha | PASS | `shell_320_320.png` |
| DEV hospedado / HML / produção | todas | — | SSO | não acessado | BLOCKED | — |
| iPhone Safari / Android Chrome | todas | — | sem aparelho | — | BLOCKED | — |

As imagens estão nesta pasta, ao lado deste arquivo.

## Fora do aceite

- Não houve deploy.
- HML só depois de revisão humana deste PR.
- O aviso cru `{"message":"404 rota não simulada"}` nos indicadores é a mensagem do stub local, não um texto de produção.
