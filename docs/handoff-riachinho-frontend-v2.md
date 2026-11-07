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

## Contrato do Cursor: integrado na main (PRs #65 e #66)
Em 07/11/2026, o backend recebeu os campos opcionais do Riachinho V2 (ver `packages/shared/src/api-contracts/dto.ts`):
- `sources?: Array<{ kind: "ministry" | "event" | "cms"; slug: string; title: string }>`
- `knowledgeMiss?: boolean`
- `promptVersion?: string`
- `GET /vivi/status` pode indicar `knowledge.mode="structured-cms"`, `ragEnabled=false` e `refreshPolicy="live-db-on-each-request"`.

Nesta branch, o FE mostra as referências oficiais consultadas e um aviso específico quando `knowledgeMiss=true`, mantendo compatibilidade com respostas antigas sem os campos opcionais.

**Segurança:** o backend não retorna URLs de fontes. O frontend valida o conjunto de valores, limita os itens, recusa slugs malformados e **não inventa páginas por slug**:
- Ministério → link genérico para `/ministerios/`.
- Evento → link genérico para `/eventos/`.
- Conteúdo CMS → somente o título da fonte, sem navegação inventada.

Esses links levam a seções existentes; não representam links profundos para a publicação específica.

**Bloqueador operacional:** o projeto Vercel `id-riacho1-api-hml` ainda mostrava o commit antigo `731a655e` na checagem de 07/11/2026. É necessário o Cursor/deploy responsável publicar o backend merged em HML e executar smoke tests de `/vivi/status`, `/public/vivi/chat`, `sources`, `knowledgeMiss`, consentimento, 429 e indisponibilidade do Gemini. A presença do contrato em `main` não implica que HML já responde esses campos.

**Integração F2:** o PR #68 atualizou `API_CONTRACT_VERSION` para `0.7.2-f2`; integração das telas autenticadas ficará em um PR próprio após validação de HML, com base em `docs/handoff-frontend-api-f2.md`.

## Verificações de aceite
- Testes automatizados de status, payload, consentimento, HTTPS, HTTP 429, falha de rede, resposta malformada e resposta mock.
- QA manual no build de PR: desktop 1440px, tablet 768px e celular 390px; abertura, fechamento com Escape, teclado, links oficiais, consentimento e retorno do foco.
- Simular indisponibilidade de IA e confirmar que o site e links oficiais continuam úteis.
- Validar no editor o rascunho diante de falha de rede/403/429, resposta malformada e envio pelo botão e Ctrl+Enter.
- Não mesclar nem habilitar no GitHub Pages/produção sem aceite de homologação.
