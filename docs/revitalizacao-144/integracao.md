# Rodada #144 — integração da frente J (#154)

Baseline: `3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3`. Produto: Sistema da Igreja de Deus — Riacho Fundo I. Eklesia permanece só como benchmark e como gate da fase anterior (#125).

Este PR não declara homologação, não faz merge e não publica Pages nem a API HML.

## Estado das frentes A–I

No momento da abertura, #145–#153 tinham agente ativo e nenhum PR desta rodada. O gate em `docs/revitalizacao-144/gate.json` fica `EM_EXECUCAO` enquanto isso for verdade. O integrador não reescreve AppShell, dashboards, carteirinha, ministérios, tesouraria, eventos, tokens globais nem a suíte de QA.

Contratos para as frentes consumirem, sem editar os arquivos delas:

- `toCredentialPreview` entrega à frente B/C só `personId`, `membershipId`, nome, situação, foto e revogação. CPF, telefone e e-mail não entram.
- `ministryNavItems` lista só ministérios devolvidos pela API. Lista vazia não inventa Homens.
- `HML_ENVIRONMENT_LABEL` é o único rótulo de ambiente: "Ambiente de homologação".
- `ownersOfPath` registra o dono de cada caminho. Conflito de arquivo passa por #154.

## Limpeza com prova

Retirados porque não havia import de produto:

- `ChurchWorkspace.tsx` e `church-workspace.module.css`
- `apps/web/src/app/app/workspace.module.css`
- `DemoLogin.tsx` (só o teste de componente o montava)

A rota `/app/demo/` continua no export estático, sem `localStorage` e sem cadastro paralelo. O domínio ilustrativo `demo-domain.ts` permanece coberto por teste.

Mantidos de propósito:

- `use-church-records.ts`: ainda importado por painel, diretório, secretaria e carteirinha. São arquivos das frentes B e C. Apagar agora quebra a integração.
- `sessionStorage` do token em `api.ts`: sessão, não cadastro.
- migrations, auditoria, guards e testes.

O inventário reproduzível é `node scripts/hml/release-inventory.mjs`.

## Migração e massa

`ministry_memberships` já está em `schema.prisma` e na migration `20261109230000_eklesia_ministry_memberships`. Não houve migration nova. Sem `DATABASE_URL` deste ambiente, o Neon `idriacho1_hml` não foi consultado nem alterado. O 501 de vínculo formal segue possível até a sonda `to_regclass('public.ministry_memberships')` no banco certo.

`node scripts/hml/release-migrate-guard.mjs` é dry-run por padrão. Recusa qualquer banco que não se chame `idriacho1_hml`, não imprime a URL e não aceita `SEED_HML_MASS`. Apply exige `CONFIRM_HML_MIGRATE=idriacho1_hml` e continua sem seed e sem reset de senha. A massa da frente E só entra depois do script dela revisado, com backup e contagem de pessoas maior ou igual a 71.

## O que ainda bloqueia a homologação

- PRs A–I desta rodada
- QA das oito personas e capturas 320/390/768/1440
- 501 ainda visível em telas das frentes A e B
- fallback de `localStorage` ainda ligado às telas de B e C
- tabela de vínculo confirmada no Neon HML
- Pages e API HML no mesmo SHA deste commit, com `/meta` e `release.json`
- autorização explícita de merge e deploy

Enquanto um item acima falhar, a fase permanece em execução.

## Sonda desta branch

A sonda pública de 10/11/2026, sem credencial, viu Pages e API HML no SHA `3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3`, contrato `0.7.4-rf025`. Esse PASS de `same-sha` prova o baseline já publicado. Esta branch não foi implantada.

O inventário encontrou 501 em `persona-navigation.ts` (frente A) e `HmlPhaseOne.tsx` (frente B), e um fallback ativo em `use-church-records.ts`, importado por telas de B e C. O Neon `idriacho1_hml` não foi aberto: não havia `DATABASE_URL`. A fase permanece `EM_EXECUCAO`.

No export de preview, com homologação desligada como no CI de pull request, `/app/demo/` abre o portão de acesso e não a antiga ficha local. O HTML exportado contém o aviso de que a página não guarda cadastros e não contém `localStorage`.
