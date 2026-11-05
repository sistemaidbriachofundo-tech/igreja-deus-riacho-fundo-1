# Portal Público V3+ — acabamento futurista (05/11/2026)

Continuidade da V3, não um redesign completo. Preservamos a composição humana, as fotografias ilustrativas e a marca aprovada.

## Aplicado

- Navegação principal fixa com vidro translúcido, profundidade sutil e contraste reforçado durante a rolagem.
- Indicador de leitura no topo e controle acessível para retornar ao início.
- Percurso lateral pelas cinco seções da Home (apenas em desktop, com rótulos e atalhos reais).
- Animações de entrada progressivas, sem ocultar conteúdo quando JS está desativado.
- Luz volumétrica, gradação discreta das imagens e CTAs com feedback de movimento.
- Explorador de ministérios com controle por teclado (setas, Home, End), estado acessível e transições.
- No celular, ministérios apresentados como abas horizontais deslizáveis, em vez de cinco botões espremidos.
- Respeito a `prefers-reduced-motion`; o site deve continuar legível sem animação ou JavaScript.
- O `/app` administrativo, backend NestJS, Prisma e APIs permanecem intocados.

## Revisão antes de publicar
Conferir CI completo e imagens reais em 1440, 768 e 390 px. Verificar explicitamente a primeira dobra, a navegação flutuante em desktop, o explorador de ministérios e o celular. **Sem merge automático.**
