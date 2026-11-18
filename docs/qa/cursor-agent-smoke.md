# Smoke — Cursor Cloud Agent

Registro isolado da execução de teste da issue [#88](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/issues/88), lida junto com a central [#87](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/issues/87).

Este arquivo é só documentação. Não altera produção, segredos, configuração, migrations, CI nem dados.

## Execução

| Campo | Valor |
|---|---|
| Data (UTC) | 2026-11-09 |
| Issue | https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/issues/88 |
| Central | https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/issues/87 |
| Branch base | `main` |
| Commit base | `194f8f9caa3d61199183c49d8fcabc303eacbaeb` |
| Mensagem do commit base | Merge pull request #3 from sistemaidbriachofundo-tech/dependabot/github_actions/actions/setup-node-7 |

## Suíte de testes do frontend

O frontend é o workspace `@idbrf/web` (`apps/web`). A suíte unitária usa Vitest (`apps/web/vitest.config.ts`): inclui `src/**/*.test.ts` e `src/**/*.test.tsx`, em ambiente Node, com JSX automático (o mesmo runtime do Next).

Na raiz do repositório, com Node 22 (`.nvmrc` e a CI):

```bash
npm ci
npm run build -w @idbrf/shared
npm run test -w @idbrf/web
```

O script do workspace é `vitest run --passWithNoTests`. O build de `@idbrf/shared` é necessário porque o pacote expõe `./dist` e `src/lib/brand.test.ts` importa `@idbrf/shared`. Sem esse build, o Vitest não resolve o entry do pacote. A CI faz o mesmo build antes de `npm run test`.

O job `test` em `.github/workflows/ci.yml` executa `npm run test` na raiz. Esse comando inclui `@idbrf/web` e os outros workspaces, depois do build de `@idbrf/shared` e `@idbrf/db` e de `prisma migrate deploy` em Postgres. Para repetir só o frontend, o comando do workspace acima basta e não exige banco.

## Três recomendações para evitar conflitos entre agentes

1. Um agente, um worktree, uma branch e um PR. Partir sempre da `main` mais recente. Não fazer push nem merge direto em `main`.
2. Não editar a mesma unidade funcional que outro agente. `schema.prisma`, migrations, `packages/shared/**`, `package-lock.json` e a configuração de deploy ficam com o agente integrador, depois de o contrato estar pactuado.
3. Abrir o PR em rascunho, declarar antes os arquivos exclusivos, as dependências e os testes, e esperar revisão humana. Não tratar a frente como concluída sem E2E e validação na HML quando o fluxo exigir isso.

## Escopo deste PR

Único arquivo criado: `docs/qa/cursor-agent-smoke.md`. Nenhum outro caminho foi alterado.
