# Tokens do painel — ID Riacho 1

Guia da frente H (#152, epic #144) para as frentes A–G e para o integrador J (#154).
A paleta continua a da Igreja de Deus no Riacho Fundo I: marrom `#4A2612`, creme `#F7EDE0`, ouro `#D4AF37`.
Ouro e bronze não são texto pequeno sobre fundo claro.

Os componentes vivem em `apps/web/src/components/ui`. Os nomes semânticos também estão no final de `apps/web/src/app/globals.css`, num bloco marcado `Frente H`. Esse bloco não troca o layout do portal; ele corrige texto, foco e alvo que o próprio `globals.css` deixava abaixo do critério.

## Importar

```tsx
import {
  Alert,
  Avatar,
  Breadcrumb,
  Button,
  DataTable,
  Drawer,
  EmptyState,
  Modal,
  PageHeader,
  PasswordField,
  Skeleton,
  StatCard,
  Tabs,
  Tooltip,
} from "../components/ui";
```

`PageHeader` usa `h2` por padrão. A página fica com um único `h1` quando o cabeçalho da rota recebe `heading="h1"`.

## Nomes

| Uso | Token | Valor |
| --- | --- | --- |
| Fundo da página | `--ds-surface` | creme `#F7EDE0` |
| Cartão e campo | `--ds-surface-raised` | `#FFF9F3` |
| Faixa escura | `--ds-surface-inverse` | marrom `#4A2612` |
| Texto | `--ds-text` / `--color-ink` | `#4A2612` |
| Texto secundário | `--ds-text-muted` / `--color-ink-muted` | `#6E4A36` (6,73 sobre o creme) |
| Texto de apoio do portal | `--ds-support` | `#243E42` (9,97 sobre `#EDF1EA`) |
| Bronze em texto pequeno | `--color-bronze-text` | `#7A4A16` (6,44 sobre o creme) |
| Texto sobre ouro | `--color-on-accent` / `--ds-on-gold` | `#4A2612` |
| Texto sobre marrom | `--ds-text-on-inverse` | `#F7EDE0` |
| Borda | `--ds-edge` | `#9A7355` |
| Foco em fundo claro | `--ds-focus-ring` | `#4A2612`, 3 px, afastado 3 px |
| Foco em fundo escuro | `--ds-focus-on-inverse` | `#F7EDE0` |
| Alvo de toque | `--ds-target` | `2.75rem` (44 px) |
| Raios | `--ds-radius-sm/md/lg` | 0,5 / 0,75 / 1 rem |
| Espaço | `--ds-space-1` … `--ds-space-8` | 0,25 rem até 4 rem |
| Título | `--ds-font-title` | Montserrat |
| Leitura | `--ds-font-body` | Inter, 16 px, entrelinha 1,6 |

Dentro do kit, o modo escuro é `data-appearance="dark"` no recipiente `.scope`. Ele não altera o portal público. Canvas `#24160F`, cartão `#3A261C`, texto `#F7EDE0`, secundário `#E7D3C0`.

## Como usar

- Uma ação primária por região. O botão primário é ouro com texto marrom e borda marrom.
- Estado vazio, erro, carregando e sucesso levam texto. A cor não é o único sinal.
- `PasswordField` coloca Mostrar ao lado do campo, com 44×44 px. Não use um botão absoluto de 32 px.
- `Modal` e `Drawer` fecham com Escape, prendem o Tab e devolvem o foco. O fundo fica `inert`.
- `Tabs` responde a setas, Home e End. `Tooltip` liga `aria-describedby` e some com Escape.
- Tabelas usam lista abaixo de 768 px para a página não rolar na horizontal.
- Avatares são iniciais. Não coloque foto de pessoa real.
- Zoom 200% e larguras 320, 360, 390, 768, 1024, 1440 e 1920: quebra de palavra, `min-width: 0` e alvo de 44 px. A vitrine está em `/design-system/`.

## Auditoria do PR #120

Medido de novo sobre o `main` `3c7375c`.

| Achado do PR #120 | Situação neste SHA | O que a frente H fez |
| --- | --- | --- |
| Texto `#67797E` com 3,98 sobre `#EDF1EA` e 4,24 sobre `#F7F7F3` | O parágrafo da agenda usa `var(--ds-support)`, hoje `#243E42` (9,97 / 10,61). O hex antigo não está no código. | Teste trava `#243E42` nesses fundos. |
| Vazio `#697B7E` com 3,72 sobre `#E9ECE6` | O vazio também usa `--ds-support` (9,55). | Mesmo teste. |
| Ouro `#B48850` no título “encontros.” (2,79) e `#AF8553` em “AGENDA PÚBLICA” (2,91) | Continuam literais em `apps/web/src/components/public-live.module.css`. | Arquivo da agenda, fora desta frente. Trocar a cor do `<em>` e de `.overline` por `--ds-text` (`#4A2612`) ou `--color-bronze-text` (`#7A4A16`). |
| Recorte de “encontros.” no zoom 200% e “Comunhão” colado em “Serviço” | O título da agenda usa `text-wrap: balance` no mesmo módulo. A barra global `.mobile-bottom-link span` usava `white-space: nowrap` e fonte até 0,58 rem. | O `nowrap` global passou a quebrar. O `text-wrap: balance` da agenda fica para a frente dona do arquivo, com o integrador J. |
| “Mostrar senha” com 32 px | `apps/web/src/components/login-screen.module.css`, classe `.reveal` (`padding: 9px`, fonte 11 px). | Não editei a tela de entrada. O kit oferece `PasswordField`. |

Há outros hex de texto abaixo de 4,5 no mesmo `public-live.module.css` (`#64777A` 4,39, `#758083` 3,79, `#65787B` 4,33, `#627579` 4,12, `#798687` 3,21). A correção é a mesma: `--ds-text-muted` ou `--ds-support`. J (#154) é quem resolve o conflito se a frente da agenda também alterar esse arquivo.

## O que este PR não altera

AppShell, PersonaHome, HmlPhaseOne, credenciais, ministérios, tesouraria, eventos e o módulo da agenda. Sem merge e sem deploy.
