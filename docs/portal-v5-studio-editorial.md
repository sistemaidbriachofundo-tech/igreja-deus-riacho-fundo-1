## Estúdio editorial já conectado ao contrato backend

Rota: \`/app/editorial/\`

- Disponível no menu do Church OS; deixa explícito que é o **backend real autenticado**, separado da demonstração sintética.
- Acessa \`/cms/contents\`, \`/events\`, \`/ministries\` com JWT de sessão e permissões da própria API.
- Editor de notícias e textos: criação de rascunho, edição, transições de revisão, aprovação e publicação.
- Agenda: criação/edição de eventos e publicação ou cancelamento.
- Ministério: apresentação, programação, participação e liderança que foi autorizada para divulgação.
- Login sem credenciais embutidas; quando a API HTTPS não está configurada, mostra estado de ausência honesto.
- Backend continua responsável por RBAC, escopo ministerial e auditoria: o formulário React não concede nenhuma permissão.
- Data do evento no editor é interpretada no fuso local do navegador, com timestamp ISO enviado ao backend; para produção definitiva, requer padronização explícita do fuso Brasília na UX.
- **Importante:** a interface não transforma a demonstração do painel de membros em dados de produção.

## Segurança de release
Mesmo que o CMS publique dados no backend, a Home pública só consulta esses dados se \`NEXT_PUBLIC_PORTAL_LIVE_ENABLED=true\` e \`NEXT_PUBLIC_API_URL\` estiverem configurados no build. Isso permite homologar os cadastros antes da divulgação pública.
