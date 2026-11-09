# Auditoria visual por perfil

Gerada em 2026-11-09T18:28:05.020Z. Base http://127.0.0.1:3000. Fundação #102: ref lido; componentes ausentes na main.

Nenhuma tela bloqueada foi simulada. Achados P2 não reprovam o caso.

| Caso | Perfil | Superfície | Veredito | Severidade |
| --- | --- | --- | --- | --- |
| UX-01 | visitante | Início | FAIL | P1 |
| UX-02 | visitante | Quem somos | PASS | P2 |
| UX-03 | visitante | Agenda e estado vazio | FAIL | P1 |
| UX-04 | não autenticado | Formulário na publicação (acesso desligado) | PASS | P2 |
| UX-05 | não autenticado | Gate de /app e /app/secretaria sem sessão | PASS | P2 |
| UX-06 | não autenticado | Erro com credencial sintética recusada | PASS | P2 |
| UX-07 | SECRETARIA | Workspace autenticado de fichas | BLOCKED | — |
| UX-08 | PASTOR | Dashboard pastoral | BLOCKED | — |
| UX-09 | PLATFORM_ADMIN | Dashboard de plataforma | BLOCKED | — |
| UX-10 | TESOURARIA | Dashboard financeiro | BLOCKED | — |
| UX-11 | LIDER_MINISTERIO | Dashboard do líder de ministério | BLOCKED | — |
| UX-12 | MEMBRO | Dashboard do membro | BLOCKED | — |
| UX-13 | fundação | Vitrine /design-system | BLOCKED | — |

## Achados

### UX-01 — FAIL

Zoom 200% sobre uma janela de 360 px (largura CSS 180) corta “encontros.”. A página fica 39 px mais larga (scrollWidth 219). Em /eventos/ o excedente é 25 px. Em 320 px CSS não há rolagem horizontal.

Evidência: qa/ux-personas/evidence/ux-01-360.jpg, qa/ux-personas/evidence/ux-01-390.jpg, qa/ux-personas/evidence/ux-01-768.jpg, qa/ux-personas/evidence/ux-01-1440.jpg, qa/ux-personas/evidence/ux-01-1920.jpg, qa/ux-personas/evidence/ux-01-foco.jpg, qa/ux-personas/evidence/ux-01-zoom-200.jpg, qa/ux-personas/evidence/ux-01-menu-360.jpg

- P1 (zoom-200): Zoom 200% sobre uma janela de 360 px (largura CSS 180) corta “encontros.”. A página fica 39 px mais larga (scrollWidth 219). Em /eventos/ o excedente é 25 px. Em 320 px CSS não há rolagem horizontal.
- P1 (360): Contraste 3.98 (#67797E sobre #EDF1EA, 13 px) em “Somente eventos aprovados para divulgação. Datas e locais são apresent”. Limiar 4.5.
- P1 (360): Contraste 3.72 (#697B7E sobre #E9ECE6, 14 px) em “Os próximos encontros aparecem aqui quando forem confirmados e publica”. Limiar 4.5.
- P1 (768): Contraste 3.98 (#67797E sobre #EDF1EA, 16 px) em “Somente eventos aprovados para divulgação. Datas e locais são apresent”. Limiar 4.5.
- P2 (360): Contraste 3.74 (#9B7544 sobre #F5F2E9, 11 px) em “01 / QUEM SOMOS”. Limiar 4.5.
- P2 (360): Contraste 1.87 (#FFF9E7 sobre #CFB58D, 10 px) em “FÉ · COMUNHÃO · FAMÍLIA”. Limiar 4.5.
- P2 (360): Contraste 1.48 (#E3DFD0 sobre #CFB58D, 9 px) em “IMAGEM ILUSTRATIVA”. Limiar 4.5.
- P2 (360): Contraste 3.46 (#A07B49 sobre #F5F2E9, 10 px) em “01”. Limiar 4.5.
- P2 (360): Contraste 2.91 (#AF8553 sobre #EDF1EA, 10 px) em “AGENDA PÚBLICA”. Limiar 4.5.
- P2 (360): Contraste 2.79 (#B48850 sobre #EDF1EA, 39 px) em “encontros.”. Limiar 3.
- P2 (1440): Contraste 2.79 (#B48850 sobre #EDF1EA, 63 px) em “encontros.”. Limiar 3.
- P2 (1920): Contraste 2.79 (#B48850 sobre #EDF1EA, 65 px) em “encontros.”. Limiar 3.

### UX-02 — PASS

Os P2 não bloqueiam o fluxo. A correção fica com a frente dona da tela.

Evidência: qa/ux-personas/evidence/ux-02-360.jpg, qa/ux-personas/evidence/ux-02-1440.jpg

- P2 (360): Contraste 1.70 (#E8C180 sobre #FFFFFF, 11 px) em “01 / NOSSA ESSÊNCIA”. Limiar 4.5.
- P2 (360): Contraste 1.54 (#E8C180 sobre #F5F4EF, 11 px) em “02 / O QUE NOS MOVE”. Limiar 4.5.
- P2 (360): Contraste 3.34 (#A47F4A sobre #F5F4EF, 11 px) em “01”. Limiar 4.5.

### UX-03 — FAIL

Zoom 200% sobre uma janela de 360 px (largura CSS 180) corta “encontros.”. A página fica 39 px mais larga (scrollWidth 219). Em /eventos/ o excedente é 25 px. Em 320 px CSS não há rolagem horizontal.

Evidência: qa/ux-personas/evidence/ux-03-360.jpg, qa/ux-personas/evidence/ux-03-1440.jpg, qa/ux-personas/evidence/ux-01-zoom-200.jpg

- P1 (zoom-200): Zoom 200% sobre uma janela de 360 px (largura CSS 180) corta “encontros.”. A página fica 39 px mais larga (scrollWidth 219). Em /eventos/ o excedente é 25 px. Em 320 px CSS não há rolagem horizontal.
- P1 (360): Contraste 4.24 (#67797E sobre #F7F7F3, 13 px) em “Somente eventos aprovados para divulgação. Datas e locais são apresent”. Limiar 4.5.
- P1 (360): Contraste 3.72 (#697B7E sobre #E9ECE6, 14 px) em “Os próximos encontros aparecem aqui quando forem confirmados e publica”. Limiar 4.5.
- P1 (768): Contraste 4.24 (#67797E sobre #F7F7F3, 16 px) em “Somente eventos aprovados para divulgação. Datas e locais são apresent”. Limiar 4.5.
- P2 (360): Contraste 3.10 (#AF8553 sobre #F7F7F3, 10 px) em “AGENDA PÚBLICA”. Limiar 4.5.
- P2 (360): Contraste 2.97 (#B48850 sobre #F7F7F3, 39 px) em “encontros.”. Limiar 3.
- P2 (1440): Contraste 2.97 (#B48850 sobre #F7F7F3, 63 px) em “encontros.”. Limiar 3.
- P2 (1920): Contraste 2.97 (#B48850 sobre #F7F7F3, 65 px) em “encontros.”. Limiar 3.

### UX-04 — PASS

Os P2 não bloqueiam o fluxo. A correção fica com a frente dona da tela.

Evidência: qa/ux-personas/evidence/ux-04-360.jpg, qa/ux-personas/evidence/ux-04-390.jpg, qa/ux-personas/evidence/ux-04-768.jpg, qa/ux-personas/evidence/ux-04-1440.jpg, qa/ux-personas/evidence/ux-04-1920.jpg, qa/ux-personas/evidence/ux-04-foco.jpg, qa/ux-personas/evidence/ux-04-zoom-200.jpg

- P2 (360): Controle "Mostrar senha" mede 60×32 px em Formulário na publicação (acesso desligado) a 360 px.
- P2 (390): Controle "Mostrar senha" mede 60×32 px em Formulário na publicação (acesso desligado) a 390 px.
- P2 (768): Controle "Mostrar senha" mede 60×32 px em Formulário na publicação (acesso desligado) a 768 px.
- P2 (1440): Controle "Mostrar senha" mede 60×32 px em Formulário na publicação (acesso desligado) a 1440 px.
- P2 (1920): Controle "Mostrar senha" mede 60×32 px em Formulário na publicação (acesso desligado) a 1920 px.

### UX-05 — PASS

Os P2 não bloqueiam o fluxo. A correção fica com a frente dona da tela.

Evidência: qa/ux-personas/evidence/ux-05-360.jpg, qa/ux-personas/evidence/ux-05-1440.jpg

- P2 (360): Controle "Mostrar senha" mede 60×32 px em Gate de /app e /app/secretaria sem sessão a 360 px.
- P2 (390): Controle "Mostrar senha" mede 60×32 px em Gate de /app e /app/secretaria sem sessão a 390 px.
- P2 (768): Controle "Mostrar senha" mede 60×32 px em Gate de /app e /app/secretaria sem sessão a 768 px.
- P2 (1440): Controle "Mostrar senha" mede 60×32 px em Gate de /app e /app/secretaria sem sessão a 1440 px.
- P2 (1920): Controle "Mostrar senha" mede 60×32 px em Gate de /app e /app/secretaria sem sessão a 1920 px.

### UX-06 — PASS

Os P2 não bloqueiam o fluxo. A correção fica com a frente dona da tela.

Evidência: qa/ux-personas/evidence/ux-06-erro-390.jpg, qa/ux-personas/evidence/ux-06-erro-1440.jpg, qa/ux-personas/evidence/ux-06-gate-secretaria.jpg

- P2 (390): Controle "Mostrar senha" mede 60×32 px em Erro com credencial sintética recusada a 390 px.

### UX-07 — BLOCKED

A rota integrada existe, mas o workspace só aparece depois de /auth/me. Esta auditoria não abre sessão, não sobe banco e não usa credencial. O PR #106 (ficha) não está na main.

### UX-08 — BLOCKED

Não há página de dashboard do pastor. Cuidado pastoral está em DasOperations, atrás da sessão, e o próprio painel HML marca essa integração como pendente.

### UX-09 — BLOCKED

Não há rota /app/admin nem painel exclusivo do administrador. O gate de /app é a única superfície integrada sem sessão.

### UX-10 — BLOCKED

Não há rota de tesouraria. FinanceBoard só entra em /app/operacao depois da sessão. O PR #108 não está integrado e não foi aberto nesta auditoria.

### UX-11 — BLOCKED

Não há dashboard do líder. O desvio pós-login para /app/operacao está no código, mas a tela autenticada não foi exercitada.

### UX-12 — BLOCKED

Não há portal do membro. /app/demo troca de perfil com dados sintéticos locais, porém o layout /app esconde a página atrás do login.

### UX-13 — BLOCKED

O PR #102 está em rascunho e não faz parte da main. A vitrine e os componentes ui/ não foram copiados para esta branch.

Evidência: qa/ux-personas/evidence/ux-13-ausente-1440.jpg
