# Tesouraria W2 — contrato de posição sobre o ledger existente

Issue #96. Este documento é o contrato da frente. Não altera `schema.prisma`, migrations, `packages/shared` nem `apps/api/src/auth`.

## O que já existe na `main` (não reimplementar)

Modelos em `packages/db/prisma/schema.prisma`:

- `LedgerAccount`, `LedgerEntry`, `LedgerEntryLine` — partidas dobradas, centavos, status `DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | REVERSED`
- Dupla aprovação em `firstApprovedByUserId` / `secondApprovedByUserId` (`nextDualApprovalStage` em `packages/shared`)
- Estorno: original vira `REVERSED`; nasce outro `LedgerEntry` `APPROVED` com `reversalOfEntryId` único e lados invertidos
- `CostCenter`, `Fund`, `Budget`, `AccountingPeriod`, `BankImportBatch` (adapter `MOCK`/`FILE`; SICOOB/BRB/CORA são rótulos, sem API live)
- API em `apps/api/src/finance`: `/ledger/*`
- RBAC na `main`: `canAccessFinance` = somente `TESOURARIA` na congregação piloto. `PLATFORM_ADMIN`, `SECRETARIA`, `PASTOR`, `LIDER_MINISTERIO` e `MEMBRO` não operam o caixa

## O que este módulo acrescenta

`apps/api/src/treasury` lê e grava **somente** essas tabelas.

| Medida | Significado | O que não é |
|---|---|---|
| Receita recebida | Caixa que entrou contra receita ou contra baixa de recebível. Entram `APPROVED` e o par de estorno (`REVERSED` + lançamento invertido) | Não é a receita bruta reconhecida |
| Recebível em aberto | Saldo devedor das contas `ASSET` `1.2*` | Não entra no caixa nem na receita recebida |
| Caixa liquidado | Saldo devedor das contas `ASSET` `1.1*` depois dos estornos | Não é o disponível |
| Despesa comprometida | Saldo credor das contas `LIABILITY` `2.1*` (aprovada e ainda não paga) | Não inclui `DRAFT` nem `PENDING_APPROVAL` |
| Disponível | Caixa liquidado − despesa comprometida | Não subtrai de novo a despesa já paga |
| Bruto / taxa / líquido | Crédito em `REVENUE`, débito em `EXPENSE` `5.9*`, diferença | A taxa não é uma segunda receita |

Papel da conta, sem coluna nova:

- `1.1` caixa, `1.2` a receber, `2.1` a pagar, `5.9` taxa, demais `EXPENSE` despesa, todo `REVENUE` receita
- Código fora disso vai para `unclassifiedCents` e **não** altera os quatro saldos

Lançamento em espécie (`POST /treasury/cash-receipts`) nasce `DRAFT` pelo `FinanceService.createEntry`. A dupla checagem continua sendo `POST /ledger/entries/:id/submit` e duas aprovações de pessoas diferentes. `DRAFT`, `PENDING_APPROVAL` e `REJECTED` não entram na posição. O estorno entra aos pares: o original `REVERSED` e o lançamento invertido `APPROVED` se anulam. Contar só o estorno inverteria o saldo.

Idempotência de aplicação: `audit_logs.action = treasury.idempotency` com `metadata.idempotencyKey`. A segunda chamada devolve o mesmo lançamento e não cria outro. Estorno continua no serviço de ledger já existente.

## Exemplo sintético (centavos)

1. Oferta à vista 10000: débito `1.1.01`, crédito `4.1.01`
2. Dizimo a receber 8000: débito `1.2.01`, crédito `4.1.01`
3. Despesa comprometida 5000: débito `5.1.01`, crédito `2.1.01`

Posição aprovada: recebido 10000, a receber 8000, caixa 10000, comprometido 5000, disponível 5000, bruto 18000. A baixa do recebível (débito caixa, crédito `1.2`) aumenta o recebido e zera o recebível **sem** somar o bruto de novo.

## BLOCKED para o integrador

Não aplicado neste PR. Sem DDL, sem edição de `schema.prisma` / migrations / `packages/shared` / `apps/api/src/auth`.

1. **Chave única de idempotência.** `audit_logs` não tem unicidade. Duas requisições simultâneas com a mesma chave ainda podem criar dois lançamentos. Proposta, só quando o integrador tiver exclusividade:

```sql
ALTER TABLE "ledger_entries"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "treasury_kind" TEXT,
  ADD COLUMN "gross_cents" INTEGER,
  ADD COLUMN "fee_cents" INTEGER;

CREATE UNIQUE INDEX "ledger_entries_church_idempotency_uidx"
  ON "ledger_entries" ("church_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
```

2. **Papel de liquidez.** Hoje o papel é prefixo de `code`. Uma coluna `liquidity_role` evitaria depender do código. Não criar enum em paralelo aos agentes que editam o schema.

3. **Catálogo de endpoints** em `packages/shared/src/api-contracts/index.ts`. As rotas `/treasury/*` existem na API e ficam de fora do mapa até o integrador publicar o contrato.

4. **RBAC do PR #101** (`cursor/rbac-personas-a3-649a`). A matriz (`TESOURARIA` lê/grava ledger; admin técnico não; 401 sem sessão na política nova) **não está integrada**. Este módulo usa `canAccessFinance` e `@Roles(TESOURARIA)` da `main`. Não edita guards. `ACCESS_POLICY_MODE` e `AccessPolicyGuard` continuam no PR #101.

5. **Banco, Pix e maquininha.** Nenhum cliente HTTP, nenhum segredo, nenhum débito. Adapters SICOOB/BRB/CORA permanecem rótulos do módulo de importação já existente. Pesquisa em #99 / #100.

6. **Design System #93 / PR #102.** O painel usa os tokens que já estão em `globals.css` (`--color-marrom`, `--color-creme`, `--color-dourado`). Não incorpora o PR do DS e não altera `AppShell`, `HmlPhaseOne` nem a secretaria. O item de menu da tesouraria fica de fora até alguém poder editar o `AppShell` com exclusividade. A rota direta é `/app/tesouraria/`.

7. **Navegador autenticado contra Postgres HML.** Este ambiente não grava lançamento real nem sintético em banco. A evidência de posição, idempotência, estorno e dupla contagem é a suíte Jest. A evidência de tela é o painel estático, com a ilustração marcada como contrato e sem saldo de igreja.
