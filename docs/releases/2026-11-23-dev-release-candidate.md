# RF1 — Candidata de fechamento DEV, liberação para homologação

**Data:** 2026-11-23 (Brasília)  
**Base técnica conhecida:** `da22ad2b464dbbbdd22c3d988da4b93b6229f72e` (DEV fixo e API QA READY, CI 45208753931 aprovado)  
**Alterações desta candidata:** PR #279, regra editável de bloqueio semanal do Louvor com efeito no sorteio — sujeito a CI e deploy DEV  
**Estado:** **NO-GO HML até cumprir os gates abaixo.** Documento de execução e rastreabilidade; não é aceite de testes autenticados nem aprovação pastoral.

## A. Contrato de ambientes e governança
- DEV web **sempre** `https://id-riacho1-web-hml-git-0d6b26-gustavomarqueslopes-cmds-projects.vercel.app/`.
- DEV API: projeto isolado `id-riacho1-api-qa`. Não confundir o banco QA com HML pela nomenclatura do database.
- Homologação: GitHub Pages (`sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/`), API HML e banco HML separados.
- Produção: `igrejadeusrf1.com.br` / pipeline Hostinger; promover **somente depois de aprovação expressa**, SHA, backup e rollback.
- Não mesclar `main`, `production` e PRs paralelos às cegas. Não enviar comunicações externas ou pagamentos reais durante QA sem autorização e conta sandbox.

## B. Linha de integração e eventuais conflitos
1. Cadeia da candidata: PR #237 → #272 (cards) → #273 (integrantes OC) → #274 (escalas/ministérios/UX) → #277 (mês Louvor) → #278 (timeout); PR #279 continua essa base.
2. Avaliar em revisão separada e portar mudanças relevantes dos PRs Cursor #244, #256 (segurança/E2E NO-GO), #261 (UI), #263/#265 (carteirinha), #269 (OC), sem sobrescrever a cadeia consolidada.
3. App nativo: #275/#276 têm ciclo próprio; não considerar o APK atualizado automaticamente quando a API/web mudarem.
4. Criar manifesto único `frontend SHA / API SHA / migrações / banco / variáveis sem segredos / rollback` ao congelar o RC.

## C. Gates bloqueantes para **PEDIR** autorização DEV → HML

| Área | Cenário de aceitação verificável | Evidência exigida |
|---|---|---|
| Identidade e RBAC | Login/MFA por persona: Admin, Pastor, Secretaria, Tesouraria, Líder ministério, Líder módulo, Editor/Publicador, Membro, Convidado/Mentor; editar/revogar perfis e testar isolamento por ministério e congregação | Navegador autenticado, API 401/403, log de auditoria, sem dados reais expostos |
| Atmosfera | Adicionar/editar módulos e integrantes, posições/setor/zona/lado; sorteio integral do mês, conflitos/disponibilidade, rascunho/publicação, PDF/Excel, confirmar/recusar/substituir e notificações; manter Kairos até paridade validada | Dois perfis de liderança + voluntário, reabertura de tela, banco, PDF e log |
| Louvor | 34 integrantes QA, Janeiro/2027 (14 cultos): sortear → revisar → salvar rascunho → publicar quando autorizado; garantir qualificações de voz/instrumento, semana e limite, sem timeout | POST autenticado com tempo/resposta, gravações persistidas e visão do músico |
| OC | Integrantes Pastor, Direção, Pregação, Mídia e demais funções; modelos de cultos, gerar/editar, aprovar, publicar e PDF | Sessão Pastor; Admin apenas consulta; membro impedido |
| Eventos | Login ou conta convidada retorna ao mesmo evento; elegibilidade, lotes e menores; Mercado Pago sandbox (Pix/cartão) + webhook idempotente; QR individual por e-mail, leitura câmera e check-in sem duplicidade, cancelamento/estorno e relatório | Evidência da transação **sandbox** e correlação inscrição/cobrança/ingresso/presença |
| Tesouraria | Tesoureiro lança → Pastor decide → Tesouraria registra baixa → extrato e conciliação; contas e canais, OFX/CSV com dedupe, saldos e PDF/Excel | Comparação antes/depois dos valores por banco e centro de custo, negação de papel indevido |
| Regras / CMS | Inventário de chaves: ativa com consumidor, protegida, ou documental; editar regra permitida por escopo, publicar e comprovar efeito sem deploy; CMS rascunho/prévia/aprovação/publicação/reversão | Registro no banco, mudança na operação seguinte, auditoria; nenhuma regra documental fingindo execução |
| Secretaria/Conexão | Cadastro/Ficha 360, família/menor, admissão documento exigido → revisão pastor → carteirinha QR, transferência; trilhas/grupos/mentoria e aniversariantes por público | Sessões autorizadas cruzadas, anexos protegidos, QR em aparelho físico |
| Comunicação | E-mail transacional efetivo a caixa de teste; push/avisos e aniversário para Pastor, Secretaria, líder/mentor; consentimento, retry, destinatários e não duplicidade | Comprovante de entrega/teste autorizado; ausência de notificações indevidas |
| Portal, UX, LGPD | Menu Início/Quem Somos/Agenda/Login, novo card de eventos com **agenda antiga**, live vermelho apenas enquanto live, fotos e galeria aprovadas, último YouTube, Responsividade 1440/768/390/320, Safari/Chrome Android, foco/contraste | Capturas e vídeo com a versão exata e sem dados sensíveis |
| Operação | CI lint/tipos/tests/build, testes de migração em clone descartável, backups/restore, health+ready+meta, segredos separados e rollback ensaiado | CI verde, inventário e relatório sem credenciais |

**Se não houver autenticação autorizada para uma jornada, marcar BLOCKED, nunca PASS.**
**Se falhas P0 em acesso, pagamentos, perda de dados ou contabilidade estiverem abertas, não liberar.**

## D. Pendências externas e decisões institucionais
- Obter acesso autorizado das contas QA com MFA e da proteção Vercel; não compartilhar senhas nos comentários.
- Confirmar postos/habilitações reais de Atmosfera e Louvor, documentos por modalidade de admissão e modelos da OC.
- Configurar Mercado Pago sandbox + contas financeiras por congregação, remetente/caixa SMTP de teste e amostras sanitizadas BRB/Sicoob.
- Banco via OFX/CSV pode ser aceitável apenas se a igreja aprovar explicitamente adiamento da sincronização bancária automática.
- Publicação Android/iOS é trilha própria até validação com aparelhos e decisão de escopo de lançamento.

## E. Gate HML → produção
1. Publicar **um único RC aceito** no Pages/API/banco HML isolado, com massa sintética e manifesto.
2. Repetir E2E de todas as personas, regras, financeiro, pagamentos sandbox, e-mails, escalas e UI em aparelhos.
3. Aceite formal da Pastoral, Secretaria, Tesouraria, Ministério e responsável pelo projeto.
4. Restaurar backup em ambiente controlado, revisar relatórios/arquivos e completar manuais por perfil.
5. Remover eventos e pessoas de demonstração do público, configurar monitoramento, reverter se smoke falhar.
6. Publicar produção somente após aprovação explícita do release, jamais por CI verde isolado.

## F. Registro de execução
Para cada teste anexar: `requisito / versão SHA / rota / perfil / passos / esperado / observado / request-id / evidência / PASS|FAIL|BLOCKED / P0|P1|P2 / PR responsável / reteste`.

**Fonte técnica e histórico:** issue #249; Documento Mestre 16/11; DAS v1.2 (16/11), Caderno de Homologação 0.1 (13/11), QA DEV (19/11) e decisões do projeto até 23/11. Esta candidata permanece em DEV até obter todas as provas citadas.
