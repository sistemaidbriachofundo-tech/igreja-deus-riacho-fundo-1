# Nova direção visual — Portal Público (PR #37)

A versão inicial foi recusada pelo usuário por aparência quadrada e pouco moderna. A V2 editorial também não atingiu a qualidade desejada.

## V3 — Uma igreja feita de pessoas

**Mudanças implementadas**
- A Home não usa mais seções de elementos decorativos e cartões sem fotografia.
- Fotografia editorial como foco principal: entrada pública, comunhão, ministérios e voluntariado.
- Identidade consistente: logomarca oficial preservada, base azul-petróleo/creme e detalhes dourados.
- Seletor interativo real com os cinco ministérios (teclado, links e sem API obrigatória).
- Hub ministerial com narrativas fotográficas grandes, alternando imagem e conteúdo, sem grade de cartões.
- Cada ministério tem página própria com apresentação, valores, agenda ilustrativa e CTA de primeira visita.
- Atmosfera descrito corretamente como voluntariado.
- Horários e eventos sintéticos identificados como demonstrativos.
- As fotos de banco são sempre identificadas como **ilustrativas** e não retratam a congregação.

## Fotos usadas na fase de demonstração
As imagens editoriais são fotografias gratuitas do Unsplash, usadas conforme a Licença Unsplash; o endereço está centralizado em `apps/web/src/lib/portal-visuals.ts`.
Essas referências podem ser substituídas por fotos aprovadas da congregação, sem alterar os componentes. Não usar como prova de atividades reais da igreja.

## Limitações
- A API pública não foi conectada nesta etapa; conteúdo e agenda ainda são sintéticos.
- As imagens são carregadas via HTTPS do Unsplash: avaliar otimização/cópia própria autorizada antes da publicação definitiva.
- O Church OS em `/app` permanece sem alterações.

## Critérios de revisão
- Capturas reais em 1440/768/390px, incluindo Home inteira e páginas de ministérios.
- Auditoria estática de URLs, export das rotas e dados de demonstração.
- Lint, typecheck, testes e build no GitHub Actions.
- Sem merge/publicação antes de aprovação visual.
