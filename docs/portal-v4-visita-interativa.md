# Portal V4 — Primeira visita interativa

Implementação concluída em frontend no PR #39 (sem alterar o backend ou a produção).

## Rota nova
- \`/visita/\`: experiência responsiva em 3 passos, sem backend.
- Passo 1: pessoa informa se vem sozinha, com a família, amigos ou crianças. **Não solicita nomes, idade, saúde ou contatos.**
- Passo 2: escolhe apresentar-se à igreja ou a um dos cinco ministérios; suporta link profundo \`?ministerio=atmosfera\` etc.
- Passo 3: mostra resumo e mensagem personalizada para copiar e enviar pelo canal oficial Instagram \`@idbriacho_\`.
- Link para contatos oficiais; não promete agendamento, estacionamento, berçário ou horários sem confirmação.
- Não persiste dados no navegador ou no servidor. Interações acessíveis por botões/teclado; textos claros para visitantes.

## Integração
CTA da Home, menu de visita, destaque de primeira visita, hub de ministérios e páginas individuais conectados à rota. Cada ministério abre a jornada com o interesse correto.

## Futuro / backend
Quando houver HML e informações oficiais, adicionar fonte de configuração de horários/endereço, autorização de editoria, serviços ao visitante e mensagens. Formulários sensíveis (oração, aconselhamento, atendimento infantil) não devem coletar dados pessoais sem fluxo autenticado de consentimento, proteção de dados e triagem pelo backend.

## Evidências
- Lint/TypeScript/Vitest/Next.js build em GitHub Actions.
- Auditoria de export para \`/visita/\` e demais rotas estáticas.
- Capturas em desktop e 390px para conferência visual, antes de merge.
