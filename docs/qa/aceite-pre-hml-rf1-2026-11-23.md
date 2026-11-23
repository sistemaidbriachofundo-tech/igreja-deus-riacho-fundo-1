# RF1 — Gate definitivo DEV → Homologação

Data de corte: **23 de novembro de 2026**.
Escopo: Igreja de Deus Riacho Fundo I.
**Não promove automaticamente HML/produção.** Registrar aceite humano para a versão exata, após confirmar este documento no último SHA.

## 1. Identidade e isolamento

- Fonte da candidata: `chatgpt/dev-prehml-final-gates-20261123`; parent `chatgpt/dev-ux-gestao-regras-compacta-20261123` / `c2c0640020f635ca365ccf099889a4dded69f6ec`.
- DEV Web fixo: https://id-riacho1-web-hml-git-0d6b26-gustavomarqueslopes-cmds-projects.vercel.app/
- API QA: https://id-riacho1-api-qa.vercel.app
- HML web: GitHub Pages (caminho `/igreja-deus-riacho-fundo-1/`); **nenhum deploy na HML foi autorizado neste pacote**.
- Neon DEV QA: projeto `flat-tree-17047178`, branch `qa-massa-rf1-20261110`, ID `br-twilight-bonus-b6moawk7` (não padrão).
- Neon HML: mesmo projeto, branch `hml`, ID `br-jolly-darkness-b6f5mzsy` (**branch padrão**, NÃO confundir com QA).
- Produção: fora do escopo. Não acessar, publicar ou copiar registros pessoais/bancários.
- Antes de qualquer promoção: confirmar **idêntico SHA** da web e API, versões de migrações e URL pública/API, e proteger/backup a branch de HML.

## 2. Evidências técnicas verificadas

| Gate | Evidência | Estado |
|---|---|---|
| CI integral da anterior `c2c0640` | Actions #45268268532 | PASS |
| CI visual anterior `c2c0640` | Actions #45268268613 | PASS |
| Health e readiness da API QA | HTTP 200, `database=ok`, `commit=c2c0640020f6`, `mfaBlocking=true` | PASS |
| Rotas Home, Ministérios, Eventos e Gestão no DEV | HTML HTTP 200 | PASS apenas de resposta HTTP — não prova login |
| Isolamento local E2E oito personas | PR #290 — 64 PASS, 0 FAIL, 2 BLOCKED hospedados | PASS local / BLOCKED hospedado |
| Louvor jan/2027, 34 participantes, 14 cultos; escala mensal, sorteio, rascunho/publicação, concorrência, notificações e OC | PR #289, banco PostgreSQL descartável | PASS local |
| Eventos pagos, QR, webhook, check-in, reembolso | PR #285, simulação assinada e atores sintéticos | PASS local / BLOCKED provedor |
| Tesouraria OFX/CSV, saldos, aprovação e regras editáveis | PR #287 | PASS local / BLOCKED banco ao vivo |
| Secretaria e Conexão (aniversários, grupos, avisos) | PR #286 | PASS local / BLOCKED SMTP/PUSH externo |
| Ministros/eventos UI 320,390,768,1440 e acesso indevido | Cursor na issue #300, PR #306 | PASS navegador **local** |
| Configuração de módulos em modal, gravação/leitura e RBAC | Cursor na issue #300, PR #307 | PASS navegador **local** |
| Visual institucional completo em Vercel SSO + contas reais QA | Sem sessão autorizada | BLOCKED |
| Última candidata deste documento | conferir workflows da branch | PENDENTE até CI na SHA final |

**Importante:** nunca converter PASS local ou 200 da página estática em PASS de ponta a ponta no DEV hospedado.

## 3. Matriz de aceite por persona — hospedada

Executar em **DEV hospedado** com dados fictícios e contas QA autorizadas, sem enviar senha por chat nem desligar MFA/SSO:

| Persona | Fluxo mínimo | Requisito |
|---|---|---|
| Administrador | MFA, dashboards, Gestão do Sistema, editar módulo, salvar/reabrir, Acessos | PASS com trilha de auditoria |
| Pastor | Pastoral, aprovar despesa, Ordem do Culto, aniversariantes, PDFs | PASS |
| Secretaria | Ficha360, admissão, família, carteirinha, aniversário, mapa | PASS |
| Tesoureiro | Lançar despesa, aguardar aprovação do pastor, importar OFX, conciliar, exportar PDF/Excel | PASS |
| Líder de ministério | Gerar/editar/publicar mês inteiro, analisar sorteio/convites, editar seus integrantes | PASS |
| Líder de módulo | Ver/alterar somente módulo concedido, responder convites; outro módulo 403 | PASS |
| Membro | Minha Conta, Minha Escala, aceitar/recusar, inscrição e QR do próprio evento | PASS |
| Convidado | Criar/login convidado, inscrever-se, retornar ao mesmo evento, não acessar dados internos | PASS |
| Mídia/editor | Gerenciar conteúdo com papel próprio, sem abrir Pastoral ou Tesouraria | PASS |

Exigir evidências de ação e não apenas tela carregada. Para cada fluxo, registrar SHA, persona, rota, estado antes/depois, resultado HTTP API, screenshot sem dados pessoais e **PASS/FAIL/BLOCKED**.

## 4. Integrações e hardware — dependências explícitas

- **Mercado Pago sandbox:** não há segredo com nome MERCADO/MP na lista de variáveis do projeto API QA. Configurar token *de teste* e assinatura de webhook no gerenciador de segredos (não neste documento); validar criação, consulta, duplicidade de webhook, aprovação, cancelamento e estorno. Nunca emitir cobrança live.
- **E-mail/SMTP:** existe catálogo `EMAIL_PROVIDER` no projeto QA, mas entrega externa não foi verificada. Usar remetente e caixa de teste autorizados; verificar QR individual, recuperação e notificações sem enviar dados pessoais.
- **QR/câmera:** validar no aparelho físico, inclusive permissão de câmera, QR expirado, reutilizado, do evento errado, check-in duplicado e pessoa não autorizada.
- **BRB/Sicoob:** APIs automáticas exigem habilitação e contrato. Aceite institucional expresso pode liberar HML **com importação OFX/CSV como alternativa provisória**; não declarar integração automática concluída.
- **Notificações PUSH/WhatsApp:** validar provider em sandbox ou indicar claramente fora do escopo da rodada. Não enviar mensagens reais inadvertidamente.
- **Celulares:** Chrome Android e Safari iPhone físico para viewport 320/390, gaveta, sino, busca, modal, calendário, scanner e carteirinha.
- **Proteção do DEV:** o navegador externo chega ao SSO da Vercel. Obter sessão aprovada via configuração de Vercel; não remover o gate nem reutilizar credenciais privadas.

## 5. Critério de GO para HML

Apenas depois dos itens abaixo:

- [ ] SHA final sem commits adicionais pendentes; CI integral PASS e QA visual PASS.
- [ ] Todos os P0/P1 fechados com evidência de matriz de personas.
- [ ] Smoke autenticado em ambiente DEV hospedado aprovado (ou exceção formal de segurança explicitamente documentada pela liderança).
- [ ] Mercado Pago sandbox, e-mail sandbox e QR físico validados, ou escopo reduzido formalmente aprovado e recursos não validados bloqueados em HML.
- [ ] Ausência de vazamento de dados em 401/403, inclusive ministério e igreja diferentes.
- [ ] Dev/QA e HML DB isolados, backup de HML, migrations só no destino autorizado.
- [ ] Checklist visual de desktop/tablet/Android/iPhone com evidências.
- [ ] Aprovação explícita da liderança do projeto para **HML** com SHA e escopo da versão.

**No GO** se algum P0/P1 estiver FAIL, se o ambiente puder gerar cobrança real sem proteção, se registros reais forem copiados para QA, ou se a tela de login hospedada não for exercitada com autorização.

## 6. Checklist para promoção controlada — executar somente após GO

1. Registrar SHA/release/tag de DEV aceita e congelar commits.
2. Efetuar snapshot/backup do banco HML (não o banco DEV QA).
3. Comparar `_prisma_migrations` no HML versus código; migrar no HML sob autorização explícita com rollback definido.
4. Publicar estático em GitHub Pages com o `NEXT_PUBLIC_BASE_PATH` correto, e API HML usando exclusivamente as variáveis/DB HML. **Não apontar HML para `id-riacho1-api-qa`.**
5. Executar `/health`, `/ready`, login com MFA, roteiro de nove personas e operações sandbox com dados fictícios.
6. Confirmar links internos, mobile, e-mails somente de teste, scanner e relatórios.
7. Registrar relatório com PASS/FAIL/BLOCKED, devolver a versão para aceite antes da produção.

## 7. Registro de autorização

- Versão exata aprovada (SHA): __________________
- Escopo/ressalvas de HML: __________________
- Responsável pelo aceite: __________________
- Data do aceite: __________________
- Evidências finais: __________________

**Status no momento da criação:** PRE-HML COM BLOQUEIOS EXTERNOS. HML/produção intocadas por este trabalho.
