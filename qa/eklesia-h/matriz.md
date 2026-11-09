# Matriz Eklesia — frente H

- Fase: **EM_EXECUCAO**
- releaseComplete: **false**
- Commit avaliado: `ca00a4fd2c5d1f87cca815c3822a35cb9a92c3c2` (origin/main no momento da sonda; este PR ainda não estava commitado)
- origin/main: `ca00a4fd2c5d1f87cca815c3822a35cb9a92c3c2`
- Contrato neste commit: `0.7.4-rf025`
- Contrato na API HML: `0.7.2-f2`
- sourceSha na API HML: `ausente`
- Observado em: 2026-11-09T21:01:55.978Z
- API: https://id-riacho1-api-hml.vercel.app
- Pages: https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/

| ID | Frente | Status | Evidência |
| --- | --- | --- | --- |
| pages-home | H | PASS | Home oficial respondeu 200, com o nome da igreja e sem título do seed demonstrativo. |
| pages-nav | H | PASS | HTML público contém Início, Quem somos, Agenda e Login. |
| pages-sha | H | BLOCKED | O Pages oficial ainda não publica release.json com o SHA. O link no ar não prova este commit. |
| api-health | H | PASS | https://id-riacho1-api-hml.vercel.app/health respondeu 200. |
| api-contract | H | FAIL | A API HML anuncia 0.7.2-f2 e este commit está em 0.7.4-rf025. Push no GitHub não implantou a API. |
| api-sha | H | BLOCKED | A API HML não informa sourceSha. O processo em execução é anterior a este campo, ou foi iniciado sem SOURCE_SHA e sem VERCEL_GIT_COMMIT_SHA. |
| api-anon | H | PASS | 11 rotas privadas recusaram a sessão ausente com 401. |
| api-route-coverage | H | BLOCKED | Rotas deste commit ainda ausentes na API implantada: GET /ministry-scope/min-homens/formal-memberships HTTP 404. |
| api-public | H | PASS | Leituras públicas responderam 200 sem campo de segredo. |
| api-login-empty | H | PASS | Login sem credencial foi recusado com HTTP 400. |
| api-cors | H | PASS | O CORS autoriza a origem do GitHub Pages e não reflete origem arbitrária. |
| api-deploy | H | BLOCKED | VERCEL_TOKEN ausente. Não há permissão para implantar id-riacho1-api-hml nem para migrar o Neon idriacho1_hml. Nenhuma base de produção foi alterada. |
| schema-ministry | B | BLOCKED | schema.prisma não tem MinistryMembership. O vínculo formal segue sem tabela; a frente B ainda não pactuou a migration. Nenhuma tabela foi inventada aqui. |
| own-roster | C | BLOCKED | Não há rota GET da escala da própria sessão. Meu Espaço continua sem a lista pessoal. A frente C é quem entrega esse contrato. |
| front-A | A | BLOCKED | PR #135 draft aberto. Ainda não entra na main. |
| front-B | B | BLOCKED | Issue #127 (Ministérios, integrantes e liderança) sem PR desta fase. O módulo não foi reimplementado aqui. |
| front-C | C | BLOCKED | PR #137 draft aberto. Ainda não entra na main. |
| front-D | D | BLOCKED | Issue #129 (Navegação por persona) sem PR desta fase. O módulo não foi reimplementado aqui. |
| front-E | E | BLOCKED | Issue #130 (Eventos, presença e relatórios) sem PR desta fase. O módulo não foi reimplementado aqui. |
| front-F | F | BLOCKED | Issue #131 (CMS institucional) sem PR desta fase. O módulo não foi reimplementado aqui. |
| front-G | G | BLOCKED | PR #136 draft aberto. Ainda não entra na main. |
| persona-admin | G | BLOCKED | Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada. |
| persona-pastor | G | BLOCKED | Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada. |
| persona-secretaria | G | BLOCKED | Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada. |
| persona-tesouraria | G | BLOCKED | Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada. |
| persona-lider | G | BLOCKED | Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada. |
| persona-membro | G | BLOCKED | Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada. |
| persona-editor | G | BLOCKED | Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada. |
| persona-publicador | G | BLOCKED | Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada. |

A fase #125 permanece em execução enquanto existir FAIL ou BLOCKED. Este arquivo não declara a homologação concluída.

Capturas do site oficial já publicado, nos viewports 360, 768 e 1440. Não substituem a QA autenticada da frente G.

- `qa/eklesia-h/evidence/pages-home-360.png`
- `qa/eklesia-h/evidence/pages-home-768.png`
- `qa/eklesia-h/evidence/pages-home-1440.png`

