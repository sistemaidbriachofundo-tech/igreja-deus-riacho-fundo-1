# Mapa de merge

Leitura em 2026-11-09, com `git merge-tree --write-tree` entre `origin/main` e os branches dos PRs. A Secretaria (#91) não entra nessa conta: o agente `bc-f7491535` seguia em execução às 17:38 UTC, com branch e diff vazios.

## Onda 0 — Git limpo entre si

| PR | Branch | Arquivos | Contra a main | Contra os outros da onda 0 |
|---|---|---|---|---|
| #101 RBAC | `cursor/rbac-personas-a3-649a` | 17, em `packages/shared` e `apps/api/src/auth` | limpo | limpo com #102, #103, #104 |
| #102 Design System | `cursor/design-system-foundation-c0e3` | 17, em `apps/web/src/components/ui` e `/design-system` | limpo | limpo com #101, #103, #104 |
| #103 Login | `cursor/a1-login-nav-rapida-a1ac` | 14, login, gate, AppShell, `lib/api`, navegação | limpo | limpo com #101, #102, #104 |
| #104 QA | `cursor/qa-e2e-persona-9013` | 37, só `qa/persona-e2e` | limpo | limpo com #101, #102, #103 |
| #100 Pesquisa | `cursor/a5-pesquisa-pix-banco-e3fe` | 9, só `docs/integracoes-financeiras` | limpo | limpo com #101 |

Não há interseção de caminho entre #101, #102, #103 e #104. Empilhar os quatro em qualquer ordem produz árvore sem marcador de conflito. Isso não homologa o produto.

Quality gate fora do Git, ainda em aberto:

- #101: SonarCloud em código novo com 6,0% de duplicação (limite 3%). Lint, teste, typecheck e build passaram.
- #103: SonarCloud com security rating B em código novo (limite A). O stub local de QA embute senha fixa e tokens previsíveis e devolve `Access-Control-Allow-Origin` amplo. Lint, teste, typecheck e build passaram. O valor da senha fica só no PR #103.
- #102, #104 e #100: quality gate do SonarCloud passou nesta leitura. Build verde não é E2E.

## Contratos que o Git não vê

### Papel de site: `EDITOR_SITE` / `PUBLICADOR_SITE`

A main e o #101 usam `EDITOR_SITE` e `PUBLICADOR_SITE` em `packages/shared/src/rbac.ts`, no seed, nos controllers de CMS e na matriz `ACCESS_MATRIX`.

O PR #58 troca esses códigos por `SITE_EDITOR` e `SITE_PUBLISHER` e adiciona migration `20261106224000_site_editor_roles`. O `merge-tree` da main com #58 conflita em `packages/shared/src/rbac.ts` exatamente nesses dois nomes. `packages/shared/src/index.ts` auto-mergeia e passa a exportar `site-access.ts`, que importa `SITE_EDITOR`. Com o cânone da main, esse arquivo não compila.

Decisão para as próximas frentes: o código vigente é `EDITOR_SITE` e `PUBLICADOR_SITE`. #95 (portal) rebasa em cima disso. A migration de #58 não entra.

### Guards e rotas

#101 registra `AccessPolicyGuard` depois de `JwtAuthGuard`, `RolesGuard` e `ScopeGuard`. Célula ausente na matriz nega. Sessão ausente nas rotas classificadas responde 401; papel ou escopo insuficiente responde 403.

`GET /indicators/summary` e `GET /indicators/membership` não estão em `access-routes.ts` do #101. O controller na main não tem `@Roles`. O service inclui `counts.pastoralOpen` para quem passa em `canAccessChurch`, inclusive `PLATFORM_ADMIN`. O próprio #101 marca o achado `indicators-pastoral-count` como BLOCKED e não altera o service. Dono do conserto: frente que puder editar `apps/api/src/indicators` com handoff, depois da matriz. Esta frente não edita.

`cms/contents` continua com `@Roles` de secretaria, pastor, líder e admin. A matriz do #101 autoriza editor e publicador no recurso `cms`, e o guard de papéis responde 403 antes. #101 registra isso como alinhamento de API de negócio, também fora do auth/.

### Auditoria

`AuditController` lista `SECRETARIA`, `PASTOR` e `PLATFORM_ADMIN`. A matriz do #101 repete esse trio em `audit.read` e deixa editor e tesouraria de fora. `AuditService.toEntry` devolve `metadata: row.metadata` sem redação. Ação pastoral ou financeira citada no metadata continua visível para quem já lê a trilha. Redação é alteração de `apps/api/src/audit`, marcada BLOCKED pelo #101 (`audit-metadata-echo`). Dono: frente de auditoria, com handoff. Esta frente não edita.

### Sessão, refresh e basePath (#103 com a Secretaria)

#103 mantém o contrato `POST /auth/login`, `GET /auth/me`, `Authorization: Bearer` e o token em `sessionStorage` (`idbrf_demo_token`). O login grava o usuário devolvido pelo POST e abre `/app` pelo roteador, com `href` ainda passado por `withBasePath` para GitHub Pages e clique com modificador. `basePath` segue `NEXT_PUBLIC_BASE_PATH` ou `/igreja-deus-riacho-fundo-1`.

Timeout de rede e HTTP 403 no gate deixam de apagar o token. HTTP 401 apaga. Cache de `/auth/me` dura 120s em memória e some no reload do documento, que volta a chamar `/auth/me`.

`HmlPhaseOne` não está no diff do #103 e é a superfície da Secretaria. No refresh inicial, qualquer falha cai em `clearToken()`. Há um segundo formulário de login dentro da página. Os links do overview usam caminho relativo (`./membros/`), que resolve certo em `/app/` com `trailingSlash` e quebra se a página corrente deixar de ser `/app/`.

Conclusão: #103 e uma Secretaria que ficar fora dos 14 arquivos do #103 empilham no Git. A combinação ainda não foi montada, porque #91 não tem commit. Antes de chamá-la segura, a Secretaria ajusta só `HmlPhaseOne` (ou componente novo da ficha):

1. Apagar o token somente em 401. Timeout, 403, 404 e 409 preservam sessão e o rascunho do formulário.
2. Consumir `apiGet` / `apiPatch` já existentes. Não editar `lib/api.ts`, `LoginScreen`, `AdminAccessGate` nem `AppShell`.
3. Links internos de `/app` usam o mesmo `withBasePath` do shell. Logout pode continuar com carga completa.
4. Recarregar o documento em `/app/membros/` com sessão sintética precisa permanecer no painel. Troca Membros → Secretaria pelo menu precisa manter o mesmo runtime de cliente (`window.__IDBRF_PERF__.runtimeId` depois do #103).

Sem esse E2E, a combinação fica BLOCKED. O harness desta frente só constata o `clearToken` amplo; não simula o reload.

### Design system e telas logadas

#102 não altera `AppShell`, `LoginScreen`, `HmlPhaseOne` nem `globals.css`. Os estilos novos são CSS module. O Git não mistura a vitrine `/design-system/` com o painel. A regressão visual das telas logadas continua obrigatória depois do #103, porque o shell muda a âncora de navegação.

## PRs antigos

| PR | `merge-tree` com a main | Arquivos em conflito |
|---|---|---|
| #58 | 11 conflitos | `cms.module.ts`, `site-layout.controller.ts`, `site-layout.service.ts`, `site-media.controller.ts`, `site-media.service.ts`, `site-media.service.spec.ts`, `system-prompt.ts`, `SiteManager.tsx`, `ViviEditorialAssistant.tsx`, `vivi-editorial-assistant.module.css`, `rbac.ts` |
| #59 | 4 conflitos | `apps/api/src/main.ts`, `vivi.service.ts`, `packages/shared/openapi/f2-v0.2.yaml`, `packages/shared/src/api-contracts/dto.ts` |
| #62 | 2 conflitos | `ViviEditorialAssistant.tsx`, `riachinho-suggestion.ts` |

#58 também conflita com #62 no assistente editorial. #59 conflita com #101 nos mesmos quatro arquivos de main/openapi/dto, porque #101 não os toca e o conflito já é com a main. Dono do rebase: autor de cada PR. O integrador não edita esses módulos.

## Ordem recomendada quando houver revisão humana

Nada abaixo é autorização de merge.

1. Segurar #58, #59 e #62. Cânone de papel fica o da main. #95 reaproveita comportamento de mídia que ainda não esteja na main, já com `EDITOR_SITE`.
2. Revisar #101. O dono reduz a duplicação do quality gate. Shared e guards ficam estáveis antes de #96, #97 e #98.
3. Revisar #102. Vitrine isolada. Não substitui captura do painel logado.
4. Revisar #103. O dono tira a senha fixa e o CORS amplo do stub. Em seguida, QA reexecuta login frio, login quente, reload e clique interno com `basePath` vazio e com `/igreja-deus-riacho-fundo-1`.
5. Esperar o PR da #91. Rebase por cima de #103. Aplicar os quatro ajustes de sessão acima, só em arquivo da Secretaria. Aí sim o QA reexecuta os 3 FAIL de ficha.
6. #104 pode entrar no Git a qualquer momento da onda 0, porque só cria `qa/persona-e2e`. O relatório 86/3/2 é da main desta data, não do conjunto #103+#91.
7. #100 entra depois da onda 0 e antes de qualquer cliente de banco no #96. É documentação e fixture mock.
8. #95 depois de #101 e da decisão sobre #58. #96 depois de #101, sem migration até handoff explícito de `schema.prisma`. #97 depois de #91 e #101. #98 depois de #97 e #101.

Agentes #95, #96, #97 e #98 estavam em execução nesta leitura, sem branch e sem PR, enquanto a onda 0 ainda está draft. Eles não devem editar `schema.prisma`, migrations, `packages/shared`, `package-lock.json`, AppShell nem o workflow até o handoff.

## Proposta de handoff (sem edição aqui)

| Área | Proposta | Dono |
|---|---|---|
| `apps/api/src/indicators` | Tirar `pastoralOpen` do resumo visto por admin técnico e demais papéis sem célula pastoral, ou exigir papel no controller e na matriz | Frente de indicadores, após #101 |
| `apps/api/src/audit` | Redigir `metadata` que cite caso pastoral ou lançamento financeiro para o leitor que não tem essa célula | Frente de auditoria, após #101 |
| `apps/api/src/cms` contents | Incluir `EDITOR_SITE` e `PUBLICADOR_SITE` no `@Roles` onde a matriz já autoriza cms | #95, sem renomear o código |
| `packages/db` seed | Usuário sintético só com `EDITOR_SITE`, domínio `@example.test`, sem grant pastoral nem ledger | #101 ou identidade, em PR próprio |
| `.github/workflows/ci.yml` | Job separado para `node --test qa/integration-wave/classify.test.mjs` e para a suíte de persona. O job de persona não define sucesso de lint | Integrador, depois que os outros agentes soltarem o CI |
| `HmlPhaseOne` | Ficha e o catch de sessão descritos no plano dos 3 FAIL | #91 |
