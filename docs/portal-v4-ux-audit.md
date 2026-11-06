# Auditoria UX V4 — revisão pequena e segura

## Problemas tratados
- Menu móvel `details` podia continuar aberto durante navegação sem comportamento explícito de fechamento. Agora fecha ao escolher uma rota, ao clicar fora e com Escape; o foco retorna ao acionador ao pressionar Escape.
- Na jornada de visita, a transição de etapa trocava o conteúdo visual sem reposicionar o foco do teclado. Agora o título da etapa recebe foco após a mudança e o progresso tem semântica de progressbar.
- Links genéricos de convite na faixa final apontavam para Contato, embora a jornada específica `/visita/` já existisse. O CTA passa a direcionar à experiência.
- Âncoras de navegação ficavam parcialmente cobertas pelo cabeçalho fixo. Foi adicionado `scroll-margin-top` no escopo público.
- Menu móvel recebe limite de altura com rolagem interna quando necessário.

## Escopo / limites
Não altera banco, API, dados da igreja, aparência V3+, áreas /app nem agenda demonstrativa. Capturas já existentes cobrem largura de 320 a 1920px; a revisão também depende da validação GitHub Actions. A navegação real em alguns navegadores/dispositivos só é comprovada depois de testada nesses ambientes.
