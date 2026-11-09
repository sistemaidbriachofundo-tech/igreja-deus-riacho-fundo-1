# Conflitos

`git merge-tree --write-tree` em 2026-11-09. A árvore local `e513a84` foi montada com merges reais, sem marcador de conflito e sem edição manual.

## Onda pedida — limpa

| Par | Conflitos de arquivo |
|---|---|
| `main` + #101, #102, #103, #104, #106, #107 | 0 |
| #103 + #106 | 0 |
| #101 + #106 | 0 |
| #102 + #106 | 0 |
| #104 + #106 | 0 |
| #107 + #106 | 0 |

Não há interseção de caminho entre esses seis PRs. Isso não homologa o produto. Os FAIL de sessão e de título em 360/768 estão em arquivos que o Git conseguiu juntar.

## PRs antigos — iguais contra a main e contra a árvore integrada

| PR | Conflitos | Arquivos |
|---|---|---|
| [#58](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/pull/58) | 11 | `cms.module.ts`, `site-layout.controller.ts`, `site-layout.service.ts`, `site-media.controller.ts`, `site-media.service.ts`, `site-media.service.spec.ts`, `system-prompt.ts`, `SiteManager.tsx`, `ViviEditorialAssistant.tsx`, `vivi-editorial-assistant.module.css`, `packages/shared/src/rbac.ts` |
| [#59](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/pull/59) | 4 | `apps/api/src/main.ts`, `vivi.service.ts`, `packages/shared/openapi/f2-v0.2.yaml`, `packages/shared/src/api-contracts/dto.ts` |
| [#62](https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1/pull/62) | 2 | `ViviEditorialAssistant.tsx`, `apps/web/src/lib/riachinho-suggestion.ts` |

#58 contra #62 também conflita, inclusive no assistente editorial. O cânone de papel na main e no #101 continua `EDITOR_SITE` / `PUBLICADOR_SITE`. `SITE_EDITOR` / `SITE_PUBLISHER` aparecem no #58 e não entram nesta árvore.

Dono do rebase: autor de cada PR. Esta frente não edita esses módulos.

## Fora da onda

#108 (tesouraria) está aberto e não entrou na árvore. #95–#98 não tinham PR integrado no momento da montagem. Dependência não integrada fica registrada, sem código improvisado.
