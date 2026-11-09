# Fundação visual (W0/A4)

Contrato visual para o portal e os painéis internos da Igreja de Deus no Riacho Fundo I. Os componentes vivem em `apps/web/src/components/ui` e usam variáveis `--ds-*`. Eles não alteram `globals.css`, o `AppShell`, o login, a home nem os workspaces das outras frentes.

Lagoinha e Sara Nossa Terra entram só como princípio: acolhimento, hierarquia clara e um convite por região. A paleta, o símbolo e os textos continuam os desta igreja.

## Ver a vitrine

A rota `/design-system/` não entra no menu público. Em desenvolvimento local:

```bash
NEXT_PUBLIC_BASE_PATH= npm run dev -w @idbrf/web
```

Abra `http://localhost:3000/design-system/`. Os nomes da página são fictícios (`@example.test`) e a lista existe só no navegador. Não há API, sessão nem gravação.

## Grade

| Largura | Colunas |
| --- | --- |
| até 767 px | 4 |
| a partir de 768 px | 8 |
| a partir de 1440 px | 12 |

O miolo tem no máximo `75rem`. Alvo de toque: `2.75rem` (44 px).

## Cor

Texto normal precisa de contraste 4,5. Borda e foco precisam de 3. A vitrine recalcula as razões.

- Creme `#F7EDE0` é o fundo. Marrom `#4A2612` é o texto e o foco nesse fundo.
- Ouro `#D4AF37` é preenchimento de ação, com texto marrom. Ouro sobre creme fica abaixo de 3 e não deve virar texto.
- Bronze e terracota são acento gráfico, não texto pequeno.
- Perigo usável: `#8C2F22` com texto creme. Sucesso: `#0E5A38` com texto creme.

## Tipografia

Montserrat para títulos, indicadores e botões. Inter para leitura, campos e tabelas. Corpo de 16 px e entrelinha 1,6.

## Componentes

```tsx
import {
  Button,
  Input,
  Select,
  Card,
  Table,
  Loading,
  ErrorState,
  Modal,
  DashboardPage,
  KpiGrid,
  KpiCard,
  FilterBar,
  StatusBadge,
  EmptyState,
} from "../../components/ui";
```

`ErrorState` é o componente de erro. O nome evita o construtor global `Error`.

`Modal` fecha com Escape e com o botão Fechar, prende o Tab e devolve o foco a quem o abriu. O fundo da vitrine fica `inert` enquanto o diálogo está aberto.

No painel de exemplo, a tabela vira lista abaixo de 768 px para a página não rolar na horizontal. Indicadores: uma coluna no celular, duas a partir de 768 e quatro a partir de 1440.

## Acessibilidade

- Um `h1` na vitrine.
- Todo campo tem `label`, e o erro usa `aria-invalid` mais `role="alert"`.
- Carregamento usa `role="status"`.
- Foco visível de 3 px: marrom no creme, ouro na faixa marrom.
- Animação respeita `prefers-reduced-motion`.
- Botão primário tem borda marrom porque o ouro sozinho não se separa do creme.

## Dependência e bloqueio

Esta fundação não depende de contrato de API, RBAC ou migração. Dá para usar os componentes assim que o PR entrar na `main`.

Aplicar a fundação em `AppShell`, `LoginScreen`, `HmlPhaseOne`, `MinistryWorkspace`, home e configurações compartilhadas fica bloqueado de propósito: esses arquivos pertencem a outras frentes. Este PR não os altera.

## Teste

```bash
npm run test -w @idbrf/web -- src/components/ui/ui.test.tsx
```
