# Integração das ondas — 2026-11-09

Frente da issue #105. Este diretório e `qa/integration-wave/` são o pacote exclusivo do integrador. Nenhum módulo de login, RBAC, design system, Secretaria, schema, `packages/shared`, AppShell ou CI foi alterado.

Os PRs de produto permanecem draft. Este pacote não faz merge, deploy, carga de dados nem envio de mensagem.

| Documento | Conteúdo |
|---|---|
| [mapa-merge.md](./mapa-merge.md) | Conflitos de arquivo e de contrato, ordem de rebase |
| [regressao-qa-personas.md](./regressao-qa-personas.md) | Regressão por persona e larguras 360/768/1440 |
| [checklist-homologacao.md](./checklist-homologacao.md) | PASS / FAIL / BLOCKED reproduzível |
| [plano-tres-fail.md](./plano-tres-fail.md) | Como zerar os 3 FAIL de ficha, sem marcar aprovação |

Evidência executável da main: `node --test qa/integration-wave/classify.test.mjs`.
