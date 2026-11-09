# Checklist de homologação

Gerado a partir da main em 2026-11-09. Comando:

```bash
node qa/integration-wave/classify.mjs
node --test qa/integration-wave/classify.test.mjs
```

O teste recusa `productApproved`. Enquanto os três itens de ficha estiverem FAIL, a onda não está pronta. Lint e build do CI não entram nesta tabela.

| ID | Persona | Resultado | Evidência nesta frente |
|---|---|---|---|
| secretaria-abrir-ficha-ui | SECRETARIA | FAIL | `HmlPhaseOne`, visão membros, tabela sem botão e sem `GET /persons/:id` |
| secretaria-editar-ficha-ui | SECRETARIA | FAIL | A mesma visão não tem formulário. PATCH vigente: `isMinor`, `legalGuardianPersonId`, `householdId` |
| secretaria-reabrir-ficha-ui | SECRETARIA | FAIL | Sem ficha aberta não há segunda leitura da mesma pessoa na UI |
| editor-conta-sintetica | EDITOR | BLOCKED | `ROLE_CODES.EDITOR_SITE` existe; o seed não tem `roleCode: "EDITOR_SITE"` |
| ci-suite-onda | QA | BLOCKED | `.github/workflows/ci.yml` não chama `qa/persona-e2e` nem `qa/integration-wave` |
| indicadores-contagem-pastoral | PASTOR | BLOCKED | `pastoralOpen` no resumo; controller sem `@Roles`; #101 não mapeia a rota |
| auditoria-metadata-sem-redacao | PLATFORM_ADMIN | BLOCKED | `metadata: row.metadata` em `AuditService.toEntry` |
| hml-limpa-token-em-qualquer-erro | SECRETARIA | BLOCKED | Catch do refresh em `HmlPhaseOne` chama `clearToken()`; combinação com #103 sem E2E |
| canon-papel-editor | EDITOR | PASS | Fato de código: `EDITOR_SITE` e `PUBLICADOR_SITE` em `rbac.ts` |
| audit-papeis-do-controller | PLATFORM_ADMIN | PASS | Fato de código: rota `audit-logs` restrita a Secretaria, pastor e admin técnico |

Itens de integração que o classificador não lê sozinho, observados no `merge-tree` e no GitHub nesta data:

| ID | Resultado | Evidência |
|---|---|---|
| git-onda-0-101-102-103-104 | PASS de árvore Git | `merge-tree` sem CONFLICT entre esses branches e a main. Não é aceite de produto |
| git-pr-58 | FAIL | 11 conflitos, inclusive `rbac.ts` (`SITE_EDITOR` contra `EDITOR_SITE`) |
| git-pr-59 | FAIL | 4 conflitos, incluindo OpenAPI e DTO shared |
| git-pr-62 | FAIL | 2 conflitos, com o assistente editorial também em choque com #58 |
| pr-secretaria-91 | BLOCKED | Agente em execução, sem branch e sem PR às 17:38 UTC |
| combo-103-91-reload | BLOCKED | Ajuste prescrito no mapa; navegador não exercitado no conjunto |
| sonar-101 | BLOCKED | Duplicação 6% em código novo |
| sonar-103 | BLOCKED | Security rating B em código novo |
| frentes-95-98 | BLOCKED | Agentes em execução sem PR; dependem de #101 e, no caso de #97, também de #91 |

Contagem do classificador na main: 2 PASS, 3 FAIL, 5 BLOCKED. Os PASS são fatos de código. A homologação da onda permanece aberta.
