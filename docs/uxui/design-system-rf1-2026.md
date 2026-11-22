# Design System RF1 — aprovado 22/11/2026

## Direção oficial

- **Site público**: preto/branco e fotografia institucional, sem importar paleta colorida dos painéis. Não alterar hero, missão, logo ou programação aprovada.
- **Painéis e área interna**: menu preto, fundo #F5F6F7, cartões brancos, ação primária preta, ação secundária clara, raios 10–14px, alvos 44px e foco evidente.
- **Cores funcionais, não marcas de departamentos**: sucesso/ativo/confirmado #286B52; informação #294E70; atenção #8A651F; erro/recusa #9C3041; dourado #C9A76B em detalhes discretos e carteirinhas. Estado sempre com texto, não apenas cor.
- **Carteirinha**: faixa preta, base clara, acabamento dourado, nome/foto/QR; nenhum CPF, telefone ou e-mail no PDF. QR continua com token opaco.
- **Formulários e controles**: rótulo permanente, tamanho de toque >=44px, mensagens concretas, sem desabilitar silenciosamente ações. Botões primários pretos; alertas em cores somente quando semânticos.
- **UX**: priorizar próxima ação por persona, filtros preservados, feedback de carregamento/sucesso/erro, confirmação para operações críticas, abas com teclado, modais Escape e foco restaurado, redução de movimento, listas mobile.

## Escopo desta implementação

Refatorados os tokens do kit compartilhado, navegação do AppShell, dashboard da Secretaria, Gestão de Eventos, Tesouraria, Central de Notificações e arte das carteirinhas em PDF. Preservados endpoints, permissões, estrutura de dados e rotas. Não foi feita alteração na publicação HML nem PROD.

**Não declarar QA completo** até testes autenticados por papel em navegador, integração SMTP real e verificação de dados. Falhas ou impedimentos devem aparecer no gate de QA.

## Correção P1 após o SHA ac693064

Ações primárias e heróis que ainda usavam marrom (`#4A2612`) ou verde de identidade (`#184F43`, lima `#D7FA75`, floresta em tesouraria, mapa, regras, mídia, Vivi e inscrição pública) passaram à base preta/cinza. Estados confirmado, pendente, erro e informação permanecem `#286B52`, `#8A651F`, `#9C3041` e `#294E70`. O foco do miolo claro é preto; o dourado `#C9A76B` fica no trilho escuro e na faixa da carteirinha, porque sobre branco fica abaixo de 3:1. Alvos de menu, chevron, “mostrar senha”, pagamento e substituir escala ficam em 44px.

## Critérios de verificação

1. Testar portal público em 320, 390, 430, 768 e 1440 px: aparência preto/branco, foto, texto, CTA e programação preservados.
2. Testar login/recuperação/criação de conta e retorno ao evento após login.
3. Testar cada persona (Admin, Pastor, Secretaria, Tesouraria, Líder, Editor, Publicador, Membro, Convidado), navegação, permissão negativa, ações críticas e dados.
4. Verificar painel da Secretaria, contas da Tesouraria e cadastro/edição/check-in de Eventos com seus próprios estados.
5. Confirmar fotos e QR da carteirinha no PDF, sem dados pessoais indevidos, contraste das cores, impressão e legibilidade.
6. Executar testes unitários, integração API, E2E autenticados e auditoria WCAG 2.2 AA; distinguir testes hospedados, locais e mocks.
7. Somente DEV após aprovação. HML e produção dependem de aceite explícito posterior.
