# Fundação visual (frente H)

Contrato visual do painel interno da Igreja de Deus no Riacho Fundo I. Os componentes vivem em `apps/web/src/components/ui`. Os tokens semânticos também estão no bloco `Frente H` de `apps/web/src/app/globals.css`.

O guia para as outras frentes e para o integrador está em `TOKENS.md`.

## Ver a vitrine

A rota `/design-system/` não entra no menu público. Em desenvolvimento local:

```bash
NEXT_PUBLIC_BASE_PATH= npm run dev -w @idbrf/web
```

Abra `http://localhost:3000/design-system/`. Os nomes da página são fictícios (`@example.test`) e a lista existe só no navegador.

## Grade

| Largura | Colunas |
| --- | --- |
| até 767 px | 4 |
| a partir de 768 px | 8 |
| a partir de 1440 px | 12 |

O miolo tem no máximo `75rem`. Alvo de toque: `2.75rem` (44 px). A vitrine foi pensada para 320, 360, 390, 768, 1024, 1440 e 1920, inclusive com zoom de 200%.

## Cor

Texto normal precisa de contraste 4,5. Borda e foco precisam de 3. A vitrine recalcula as razões.

- Creme `#F7EDE0` é o fundo. Marrom `#4A2612` é o texto e o foco nesse fundo.
- Ouro `#D4AF37` é preenchimento de ação, com texto marrom. Ouro sobre creme fica abaixo de 3 e não deve virar texto.
- Texto secundário usável: `#6E4A36`. Bronze usável em texto pequeno: `#7A4A16`.
- Perigo usável: `#8C2F22` com texto creme. Sucesso: `#0E5A38` com texto creme.
- A aparência escura existe só na vitrine (`data-appearance="dark"`). O portal público não muda.

## Tipografia

Montserrat para títulos, indicadores e botões. Inter para leitura, campos e tabelas. Corpo de 16 px e entrelinha 1,6. O cabeçalho do painel é compacto: não há faixa hero na área administrativa.

## Componentes

```tsx
import {
  Alert,
  Avatar,
  Breadcrumb,
  Button,
  DataTable,
  Drawer,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PasswordField,
  Skeleton,
  StatCard,
  Tabs,
  Tooltip,
} from "../../components/ui";
```

`Modal` e `Drawer` fecham com Escape e com o botão Fechar, prendem o Tab e devolvem o foco. `PasswordField` é o substituto do controle de senha de 32 px.

## Dependência

Esta fundação não depende de contrato de API, RBAC ou migração. Aplicar o kit em `AppShell`, login, `HmlPhaseOne`, ministérios, tesouraria e eventos fica com cada frente. Este conjunto não altera esses arquivos.

## Teste

```bash
npm run test -w @idbrf/web -- src/components/ui/ui.test.tsx src/components/ui/kit.test.tsx
```
