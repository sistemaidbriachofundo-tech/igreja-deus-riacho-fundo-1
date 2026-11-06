# Igreja de Deus — Design System Público V6

## Direção visual aprovada
Implementação da **imagem-conceito 2**: "Sua jornada com Deus pode começar aqui".

A imagem aprovada é uma **referência visual**. Títulos, navegação, botões, galerias e ministérios foram recriados em React e CSS (links funcionais, layout responsivo, foco por teclado). **O print inteiro NÃO é usado como imagem de fundo.**

## Design tokens (escopo exclusivo de site público)
Arquivo: \`apps/web/src/components/portal-design-system.module.css\`.
- Cores: deep teal \`#081c20\`, ink \`#0b2427\`, cream \`#f7f4ed\`, gold \`#d8aa60\`, warm text \`#f1d6a2\`.
- Tipografia: Montserrat / Inter, com toque editorial Georgia apenas em frases de maior impacto.
- Espaçamento: escala de 8, 16, 24, 40, 64, 100 px.
- Raios: 9/18/28 px e \`999px\` nos botões.
- Transparência de vidro discreta, brilho dourado controlado, foco visível e animação respeitando redução de movimento.

## Componentes reutilizáveis
- \`PortalCinematicHero\`: hero fotográfico dinâmico com 2 CTAs reais e faixa de 5 ministérios.
- \`PortalDesktopNavigation\`: navegação e dropdown acessível com cinco ministérios.
- \`MobilePortalMenu\`: menu responsivo com fechamento em Escape, ao navegar ou ao clicar fora.
- \`PortalGlyph\`: ícones SVG de traço consistentes sem bibliotecas externas.
- \`PortalButton\`: CTA gold, glass e text com links Next.js reais.
- \`PortalHeader\` e \`PortalFooter\`: mesma linguagem em todas as rotas públicas.

## Fotografia e integridade
O hero mistura fotografias já existentes no repositório (evento/adoração) e imagem licenciada Unsplash usada na V4. Isso representa direção de arte, NÃO prova de cultos atuais e NÃO identifica líderes. Há aviso contextual nas fotos do hero. Não inventar agenda nem horário para reproduzir o mockup.

## Responsividade
- 1440–1920: hero amplo, menu de desktop, cinco cards.
- 1024–1200: title/spacing menores, dropdown desktop ou mobile conforme breakpoint.
- 768–900: header mobile, cartões roláveis com snap.
- 320–630: herói legível, CTAs com alvos de toque, faixa horizontal explorável, tipografia responsiva.
- Acessibilidade: \`<h1>\`, navs com rótulos, \`aria-current\`, foco visível, suporte a Escape, imagens decorativas sem leitura duplicada, \`prefers-reduced-motion\`.

## Escopo técnico
Preserva toda a implementação CMS da V5, Church OS interno, API e Prisma. A novidade visual é construída **sobre** o PR #41, não em substituição às suas integrações.

## Aprovação/publicação
Conferir screenshots produzidas pelo GitHub Actions antes do merge. O visual da referência é reinterpretado com os assets reais/ilustrativos existentes; não representa renderização pixel a pixel do mockup de IA.
