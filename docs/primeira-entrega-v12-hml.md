# Fechamento da primeira entrega — V12 (HML)

## Objetivo
Operação do portal ID Riacho 1 por pessoas da igreja sem trabalho técnico diário. O editor V11 já controla os blocos da Home; a V12 conclui a conexão entre backend e frontend com IA Vivi, permissões editoriais e biblioteca de fotos públicas.

## Integrações concluídas no código
- **Vivi** no painel `/app/site/`: `GET /vivi/status` e `POST /vivi/chat` com JWT, consentimento explícito, limites e aviso LGPD. As sugestões só entram no rascunho após clique humano. Mock e provider real são distinguidos visualmente, sem fingir que o mock é IA real.
- **Papéis mínimos** `SITE_EDITOR` (salva rascunhos) e `SITE_PUBLISHER` (publica), sem acesso a membros/finanças/pastoral. Migração SQL idempotente cria apenas as definições de papéis. `PLATFORM_ADMIN` gerencia a equipe via endpoints `/cms/site-layout/team` e aba Equipe. Requer que a conta do colaborador já exista; não envia senhas.
- **Fotos** com `GET /cms/site-media` e `POST /cms/site-media/upload`. Arquivos JPEG, PNG ou WebP são validados por assinatura; frontend comprime a WebP, máximo de 3 MB no backend. Somente usuários editoriais autorizados conseguem escrever. URLs públicas se destinam a fotos licenciadas para exibição pública; nunca usar para documentos pessoais.
- **Home** permanece separada em rascunho/publicado, auditada, com recuperação ao rascunho e fallback seguro. Feature flag da leitura dinâmica ativa somente na HML.

## Infraestrutura
- **PostgreSQL**: o mesmo banco dedicado da HML; nenhuma segunda instância.
- **Vercel Blob**: variável de serviço `BLOB_READ_WRITE_TOKEN` já presente no projeto API HML. **Validar se o token está associado a um Blob store ativo e autorizado.** Não inventar URL de bucket nem adicionar segredos ao GitHub.
- **IA**: o endpoint `/vivi/status` deve informar `mock`, `manus` ou `gemini`. Se `mock`, a ferramenta serve como demonstração do fluxo, **não é IA generativa ativa**. Para ativar Manus/Gemini, configurar chaves exclusivamente no backend e respeitar políticas de privacidade e custo.
- **Produção**: a Home institucional não recebe dados do Neon HML. Não habilitar flag de leitura dinâmica do site oficial antes do aceite de conteúdo real e ambiente definitivo.

## Matriz de testes de homologação
1. `GET /health`, `GET /ready`, `GET /vivi/status`, `GET /public/site-layout`.
2. Sem JWT, `GET /cms/site-layout`, `GET /cms/site-media`, `POST /vivi/chat` devem retornar 401; `GET /public/site-layout` apenas conteúdo aprovado.
3. `SITE_EDITOR`: acesso ao editor/galeria e salvar rascunho, mas `POST /cms/site-layout/publish` deve responder 403.
4. `SITE_PUBLISHER`: salvar e publicar; verificar que Home carrega layout aprovado após atualizar navegador.
5. `PLATFORM_ADMIN`: atribuir/revogar papéis editoriais de contas fictícias existentes; verificar que MEMBER não ganha acesso.
6. Upload JPEG/PNG/WebP autorizado com foto fictícia sem PII, conferir URL HTTPS e listagem/seleção; tentar SVG e arquivo acima de 3 MB (rejeitados).
7. Vivi: consentimento obrigatório no FE, texto genérico, resposta sinalizada como simulação quando `provider=mock`; jamais aplicar automaticamente nem publicar.
8. Testar em 390px e 1440px, com refresh após salvar e restauração de versão.

## Critérios para declarar pronto
CI verde; API HML e Web HML READY; escrita/leitura em banco isolado, upload real em storage, atualização de layout público após publicação, bloqueio por papel e ausência de vazamento ao site institucional. Se alguma dessas provas faltar, declarar **homologação parcial**, não liberar produção.

## Limites ainda fora do escopo
Editor de páginas arbitrárias, menus e rodapé gerenciáveis, onboarding completo de novas contas, SEO por página e agendamento editorial. Esses módulos não devem ser apresentados como entregues.
