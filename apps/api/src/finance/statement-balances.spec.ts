import { projectBankBalances } from "./statement-balances";

describe("saldos por banco e centro de custo", () => {
  it("separa caixa por centro e mantém o a pagar em aberto", () => {
    const result = projectBankBalances([
      line("DEBIT", 10000, "bank", "1.1.10.01", "ASSET", "Banco", "culto"),
      line("CREDIT", 4000, "bank", "1.1.10.01", "ASSET", "Banco", "culto"),
      line("DEBIT", 2500, "bank", "1.1.10.01", "ASSET", "Banco", "social"),
      line("CREDIT", 1500, "cash", "1.1.01", "ASSET", "Caixa", null),
      line("CREDIT", 5000, "ap", "2.1.01", "LIABILITY", "Fornecedores", "culto"),
      line("DEBIT", 2000, "ap", "2.1.01", "LIABILITY", "Fornecedores", "culto"),
    ]);
    expect(result.liveBankApis).toBe(false);
    expect(result.openPayablesCents).toBe(3000);
    expect(result.banks).toEqual([
      {
        accountId: "bank", code: "1.1.10.01", name: "Banco", balanceCents: 8500,
        centers: [
          { costCenterId: "culto", balanceCents: 6000 },
          { costCenterId: "social", balanceCents: 2500 },
        ],
      },
      {
        accountId: "cash", code: "1.1.01", name: "Caixa", balanceCents: -1500,
        centers: [{ costCenterId: null, balanceCents: -1500 }],
      },
    ]);
  });
});

function line(side: string, amountCents: number, accountId: string, code: string, type: string, name: string, costCenterId: string | null) {
  return {
    side, amountCents, accountId,
    account: { id: accountId, code, name, type },
    entry: { costCenterId },
  };
}
