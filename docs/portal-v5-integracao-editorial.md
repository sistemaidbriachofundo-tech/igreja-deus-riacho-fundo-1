# Church OS — V5: portal público vivo + contrato editorial

## Propósito
Aplicar uma arquitetura de produto à experiência V4: manter identidade visual e a jornada de primeira visita, mas preparar o portal para conteúdo verdadeiro, administrado via **API NestJS F4/F5 já implementada**, sem inventar datas, líderes ou notícias.

## Contratos reutilizados sem duplicar backend
- \`GET /public/home\`: notícias aprovadas e eventos em destaque;
- \`GET /public/events\`: eventos oficiais publicados;
- \`GET /public/ministries/:slug\`: programação, liderança **expressamente pública**, orientações, conteúdos e eventos do ministério;
- \`/cms/contents\`, \`/events\`, \`/ministries\`: endpoints protegidos existentes para produção editorial.

A projeção TypeScript fica em \`portal-live-data.ts\`. Filtra campos, rejeita URL de imagem não HTTPS, preserva texto puro e evita qualquer \`dangerouslySetInnerHTML\`.

## Release gate — obrigatório
O frontend continua funcionando como site estático via GitHub Pages. A camada dinâmica fica **desabilitada** até que estes dois parâmetros sejam definidos no build:
- \`NEXT_PUBLIC_API_URL=https://<HML-ou-PROD-HTTPS-validado>\`
- \`NEXT_PUBLIC_PORTAL_LIVE_ENABLED=true\`

Não definir essas variáveis enquanto o banco estiver com registros-semente demonstrativos ou enquanto HML, HTTPS e CORS não estiverem homologados. Os registros publicados de demo no seed não devem ser mostrados como agenda real.

Se a API não está configurada ou está indisponível, a interface mostra estado honesto de atualização e caminhos para a primeira visita e canais da igreja, jamais datas de exemplo sem aviso.

## Engenharia / segurança
- Nada de dados privados em respostas públicas, nem líderes/contatos sem \`leadershipPublic\` explícito.
- Publicações controladas pelo workflow CMS existente e pelo RBAC do NestJS; jamais confiar apenas nos componentes React para segurança.
- Sem rastreamento de formulário do visitante, sem pedir dados de menor, sem coleta de oração sem sistema dedicado.
- Backend não depende da hospedagem estática GitHub Pages: integração futura usa requisições do navegador, CORS HML/PRD e HTTPS.
- Um novo slug de ministério **exige rebuild** no export estático. As cinco rotas são mantidas.
- Conteúdo de notícias é exibido como texto plano, para impedir HTML arbitrário.

## Critérios de aceite
- Lint, typecheck, teste unitário, build/export e SonarCloud.
- Site completo funcional sem API real (fallback honesto), não confundindo demonstração com informação oficial.
- Validação em 320–1920 px pelo pipeline de responsividade existente.
- Sem merge/deploy antes de conferir a versão e a origem real dos dados.
