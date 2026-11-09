# Fluxo Secretaria → ficha → editar → reabrir

Conta sintética `ana.demo@example.test`. Pessoa `Bruno Demo Membro` (`demoPersonMembro01`). Postgres local depois do seed versionado.

## O que a interface fez

1. Login em `/login/` e abertura de `/app/membros/`.
2. Busca por Bruno. A linha da Ana some.
3. **Abrir ficha de Bruno Demo Membro**.
4. Troca do select **Família** para **Sem família vinculada** (o outro valor sintético disponível).
5. **Salvar campos permitidos**. O diálogo mostra “Ficha salva e reaberta com os dados devolvidos pela API.”
6. Fechar e abrir de novo. O select continua **Sem família vinculada**.
7. `GET /persons/demoPersonMembro01` devolve `householdId` nulo, o valor gravado.
8. `PATCH` devolve o household original do seed. O `GET` seguinte confirma a restauração.
9. Escape fecha o diálogo.

Status desta jornada: **PASS**.

Campos de nome, e-mail, situação, tipo e observações aparecem em “Consulta — a API ainda não grava estes campos”, com `readOnly`. Não foram enviados.

## O que falhou em volta da ficha

**Sessão — FAIL.** Com a lista já aberta, a recarga aborta `/memberships`, `/admissions` e `/households` e deixa `/auth/me` seguir. O token some do `sessionStorage` e a página mostra de novo “Entre no ID Riacho 1”. O trecho está em `HmlPhaseOne`: o `catch` de `refresh(stored)` chama `clearToken()` para qualquer erro. O #103 já preserva o token no gate quando a falha não é 401. A combinação desfaz isso dentro da Secretaria.

Dono do ajuste: #106, só em `HmlPhaseOne` (ou no componente da ficha). Não editar `lib/api.ts`, `LoginScreen`, `AdminAccessGate` nem `AppShell`.

**360 e 768 — FAIL.** O diálogo usa `position: fixed; inset: 0` e `align-items: flex-start`. O nome “Bruno Demo Membro” fica sob o cabeçalho fixo do shell. Overflow horizontal medido: 0 px. Botões com altura 42 px. Em 1440 o título fica legível: **PASS**.

Dono do ajuste visual: #106, `secretary-dossier.module.css`, sem aplicar o design system do #102 por conta desta frente. O #102 permanece vitrine isolada.

## Handoff

| Achado | Status | Dono | Arquivo que esta frente não toca |
|---|---|---|---|
| `clearToken` em qualquer falha do refresh | FAIL reproduzido | #106 / issue #91 | `apps/web/src/components/HmlPhaseOne.tsx` |
| Título da ficha em 360 e 768 | FAIL reproduzido | #106 | `secretary-dossier.module.css` |
| Spec de persona conta o input antes do formulário existir | FAIL da suíte, jornada real PASS | #104 | `qa/persona-e2e/tests/hml/journeys.spec.ts` |
| Classificador corta o ternário e não a tabela | leitura estática desencontrada | #107 | `qa/integration-wave/classify.mjs` |
| Usuário sintético `EDITOR_SITE` | BLOCKED | #101 ou identidade | `packages/db/prisma/seed.ts` |
| `pastoralOpen` no resumo | BLOCKED, chave presente no HTTP 200 | indicadores | `apps/api/src/indicators` |
| Metadata de auditoria | BLOCKED | auditoria | `apps/api/src/audit` |
| `EDITOR_SITE` no `@Roles` de `cms/contents` | BLOCKED, já mapeado pelo #101 | #95 | `apps/api/src/cms` |
| CI da suíte | BLOCKED | integrador | `.github/workflows/ci.yml` |
| Rebase de #58, #59 e #62 | BLOCKED por conflito | autores desses PRs | arquivos listados em `conflitos.md` |
