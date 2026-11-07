# Frontend — Riachinho QA e preparação para o V2 institucional

## Escopo desta entrega
Somente `apps/web`. A equipe de backend (Cursor) mantém `apps/api`, `packages/db`, `packages/shared`, autenticação, Gemini e recuperação de conhecimento institucional.

### Comportamento público existente
- O botão Riachinho só é renderizado se `NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED=true` e `NEXT_PUBLIC_API_URL` for um endereço HTTPS válido (HTTP somente em DEV).
- O widget consulta `GET /vivi/status` quando aberto e só permite envio ao provedor real após consentimento.
- O cliente usa exclusivamente `POST /public/vivi/chat`, `credentials: omit`, sem `Authorization` ou credenciais de backend.
- Respostas `mock` não aparecem como resposta real. Falha ou HTTP 429 mantém o texto digitado.
- O visitante pode navegar diretamente para Primeira visita, Ministérios, Agenda e Contato sem depender do Gemini.
- "Nova conversa" limpa histórico em memória, identificador de sessão, pergunta e consentimento.
- Esc fecha o painel, devolvendo foco ao botão de abertura.

### Comportamento editorial
- Usa somente `/vivi/chat` com JWT do editor já autenticado.
- Envio manual e Ctrl+Enter preservam o rascunho durante a requisição e diante de falhas.
- Uma chamada falha não deixa uma pergunta duplicada no histórico.
- Ações de envio ficam indisponíveis quando `/vivi/status` sinaliza `mock` ou provedor real sem credenciais.
- Rejeita corpo de resposta inválido e não permite usar saída simulada como sugestão.
- A publicação permanece ação explícita do editor, fora do escopo do bot.

## Contrato aguardado do Cursor para a próxima UI (não implementado)
Para exibir fundamentação institucional de respostas **sem inventar dados**, solicitar ao Cursor:
1. Confirmar qual conteúdo CMS publicado será recuperável por congregação e como o endpoint diferencia informação oficial de resposta generativa.
2. Definir no `packages/shared` campos opcionais de fontes com título, URL pública permitida e data de atualização, sem quebrar `ViviChatResponse` atual.
3. Garantir que fontes estejam restritas ao escopo público da igreja e nunca retornem links administrativos.
4. Definir código ou indicador de "informação oficial não encontrada", evitando resposta com horário, líder ou endereço inventado.
5. Documentar versionamento, casos 400/401/403/429/5xx e comportamento com IA indisponível.
6. Manter a feature flag isolada por ambiente e não expor dados pessoais nos logs.

Após o contrato ser mesclado, o frontend deverá renderizar cartões de fontes verificadas, indicação clara de ausência de dados e acesso ao conteúdo CMS original. **Não adicionar parsing especulativo de campos desconhecidos enquanto o Cursor não definir o contrato.**

## Verificações de aceite
- Testes automatizados de status, payload, consentimento, HTTPS, HTTP 429, falha de rede, resposta malformada e resposta mock.
- QA manual no build de PR: desktop 1440px, tablet 768px e celular 390px; abertura, fechamento com Escape, teclado, links oficiais, consentimento e retorno do foco.
- Simular indisponibilidade de IA e confirmar que o site e links oficiais continuam úteis.
- Validar no editor o rascunho diante de falha de rede/403/429, resposta malformada e envio pelo botão e Ctrl+Enter.
- Não mesclar nem habilitar no GitHub Pages/produção sem aceite de homologação.
