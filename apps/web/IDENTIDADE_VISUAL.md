# Identidade visual — sistema Igreja de Deus no Riacho Fundo I

Referência: prancha visual aprovada em 04/11/2026, inspirada no símbolo cruz e chama de @idbriacho_. A prancha é a fonte de verdade visual; o protótipo v5 é referência de jornadas, não de cores. Nunca confundir quantidade de seguidores do Instagram com membros.

## Paleta e tipografia
- Dourado: #D4AF37 — ações, destaques, ícones. Não usar como texto pequeno sobre fundo claro.
- Marrom profundo: #4A2612 — marca, sidebar, títulos em áreas escuras.
- Creme: #F7EDE0 — fundo e áreas de acolhimento.
- Bronze: #B8742D — ornamentos e detalhes auxiliares.
- Terracota: #C6583E — realce pontual.
- Montserrat: títulos, KPIs e navegação. Inter: texto, formulários, leitura.
- Marca: cruz e chama. Os SVGs atuais são aproximações; solicitar logotipo original SVG/PNG transparente da igreja para substituí-los.

## Layout desktop
1. Sidebar em gradiente marrom com logotipo dourado, menu com ícones e seleção em dourado.
2. Topbar discreta e limpa.
3. Banner institucional marrom-dourado com fotografia oficial e texto legível sobre a imagem.
4. Cards off-white e creme com bordas suaves, números e ícones bronze.
5. Formulários, tabelas, indicadores, estados de aprovação e carteirinhas consistentes com a mesma linguagem.

## Mobile
- Sidebar reduzida, navegação inferior fixa com os módulos disponíveis do F2.
- Sem rolagem horizontal; campos e alvos de toque confortáveis.
- Respeitar safe-area do dispositivo e preferência por movimento reduzido.
- Validar 390px (iPhone), 768px (tablet) e 1440px (desktop).

## Regras de produto
- GitHub Pages serve o portal e a demonstração local /app/demo/. O modo demo é sinalizado e **somente fictício**.
- Telas operacionais reais em /app/membros/, /app/secretaria/ e /app/membros/carteirinha/ dependem de API Nest + autenticação. Não as apresentar como conectadas enquanto isso não existir.
- Admissão F2 (contrato proposto): modality -> documents -> secretaria -> pastor; carteirinha elegível só após aprovação pastoral e membresia ativa. Acolhimento e discipulado adicionais aguardam validação institucional.
- Não expor DAS, PR, F2, protótipo v5 etc. na experiência destinada ao membro; isso é documentação de engenharia.
- Usar imagens oficiais da congregação. Não usar fotos genéricas de bancos de imagem.

## Aceite visual e técnico
- Revisão com capturas comparadas à prancha, para mobile e desktop.
- Consistência entre painel, membros, Secretaria, jornada, formulários e carteirinha.
- Nenhuma cor azul/navy herdada do protótipo anterior, exceto em semântica de sistema se justificada.
- Contraste adequado, foco visível, rótulos de campos, navegação sem mouse.
- Testes, lint, typecheck e build verdes no PR antes de recomendar merge.
