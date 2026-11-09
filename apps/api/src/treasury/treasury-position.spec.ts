import {
  buildCashReceiptLines,
  buildCommitmentLines,
  buildReceivableLines,
  buildSettlementLines,
  classifyAccount,
  projectTreasuryPosition,
  type PositionEntry,
} from "./treasury-position";

function entry(
  id: string,
  status: string,
  lines: PositionEntry["lines"],
  costCenterId?: string | null,
): PositionEntry {
  return { id, status, costCenterId: costCenterId ?? null, lines };
}

function ln(
  side: "DEBIT" | "CREDIT",
  amountCents: number,
  accountType: string,
  accountCode: string,
): PositionEntry["lines"][number] {
  return { side, amountCents, accountType, accountCode };
}

describe("classifyAccount", () => {
  it("separa caixa, recebível, a pagar, taxa e o que fica de fora", () => {
    expect(classifyAccount("ASSET", "1.1")).toBe("CASH");
    expect(classifyAccount("ASSET", "1.1.01")).toBe("CASH");
    expect(classifyAccount("ASSET", "1.10")).toBe("UNCLASSIFIED");
    expect(classifyAccount("ASSET", "1.2.01")).toBe("RECEIVABLE");
    expect(classifyAccount("LIABILITY", "2.1.01")).toBe("PAYABLE");
    expect(classifyAccount("LIABILITY", "2.2.01")).toBe("UNCLASSIFIED");
    expect(classifyAccount("REVENUE", "4.1.01")).toBe("REVENUE");
    expect(classifyAccount("EXPENSE", "5.9.01")).toBe("FEE");
    expect(classifyAccount("EXPENSE", "5.1.01")).toBe("EXPENSE");
    expect(classifyAccount("EQUITY", "3.1.01")).toBe("UNCLASSIFIED");
  });
});

describe("projectTreasuryPosition", () => {
  const offering = entry("e-oferta", "APPROVED", [
    ln("DEBIT", 10000, "ASSET", "1.1.01"),
    ln("CREDIT", 10000, "REVENUE", "4.1.01"),
  ], "cc-culto");

  const accrued = entry("e-dizimo", "APPROVED", [
    ln("DEBIT", 8000, "ASSET", "1.2.01"),
    ln("CREDIT", 8000, "REVENUE", "4.1.01"),
  ], "cc-culto");

  const committed = entry("e-conta", "APPROVED", [
    ln("DEBIT", 5000, "EXPENSE", "5.1.01"),
    ln("CREDIT", 5000, "LIABILITY", "2.1.01"),
  ], "cc-culto");

  it("mantém recebido, a receber, caixa e compromisso distintos", () => {
    const position = projectTreasuryPosition([offering, accrued, committed]);

    expect(position.receivedRevenueCents).toBe(10000);
    expect(position.receivableOpenCents).toBe(8000);
    expect(position.settledCashCents).toBe(10000);
    expect(position.committedExpenseCents).toBe(5000);
    expect(position.availableCents).toBe(5000);
    expect(position.grossRevenueCents).toBe(18000);
    expect(position.netRevenueCents).toBe(18000);
    expect(position.settledCostCents).toBe(0);
    expect(position.countedEntryIds).toEqual(["e-oferta", "e-dizimo", "e-conta"]);
  });

  it("não conta duas vezes a baixa do recebível como receita nova", () => {
    const collection = entry("e-baixa", "APPROVED", [
      ln("DEBIT", 8000, "ASSET", "1.1.01"),
      ln("CREDIT", 8000, "ASSET", "1.2.01"),
    ], "cc-culto");
    const position = projectTreasuryPosition([offering, accrued, collection]);

    expect(position.grossRevenueCents).toBe(18000);
    expect(position.receivedRevenueCents).toBe(18000);
    expect(position.receivableOpenCents).toBe(0);
    expect(position.settledCashCents).toBe(18000);
    expect(position.receivedRevenueCents).not.toBe(26000);
  });

  it("separa bruto, taxa e líquido sem tratar a taxa como receita", () => {
    const card = entry("e-cartao", "APPROVED", [
      ln("DEBIT", 9700, "ASSET", "1.1.01"),
      ln("DEBIT", 300, "EXPENSE", "5.9.01"),
      ln("CREDIT", 10000, "REVENUE", "4.1.01"),
    ]);
    const position = projectTreasuryPosition([card]);

    expect(position.grossRevenueCents).toBe(10000);
    expect(position.feeCents).toBe(300);
    expect(position.netRevenueCents).toBe(9700);
    expect(position.receivedRevenueCents).toBe(9700);
    expect(position.settledCashCents).toBe(9700);
    expect(position.availableCents).toBe(9700);
  });

  it("ignora rascunho e pendência e desfaz o efeito no estorno aprovado", () => {
    const reversal = entry("e-estorno", "APPROVED", [
      ln("DEBIT", 10000, "REVENUE", "4.1.01"),
      ln("CREDIT", 10000, "ASSET", "1.1.01"),
    ]);
    const position = projectTreasuryPosition([
      { ...offering, status: "REVERSED" },
      reversal,
      { ...accrued, status: "DRAFT" },
      { ...committed, status: "PENDING_APPROVAL" },
    ]);

    expect(position.receivedRevenueCents).toBe(0);
    expect(position.receivableOpenCents).toBe(0);
    expect(position.settledCashCents).toBe(0);
    expect(position.committedExpenseCents).toBe(0);
    expect(position.grossRevenueCents).toBe(0);
    expect(position.availableCents).toBe(0);
    expect(position.excluded).toEqual({
      DRAFT: 1,
      PENDING_APPROVAL: 1,
    });
    expect(position.countedEntryIds).toEqual(["e-oferta", "e-estorno"]);
  });

  it("não subtrai a despesa paga uma segunda vez do disponível", () => {
    const payment = entry("e-pagamento", "APPROVED", [
      ln("DEBIT", 5000, "LIABILITY", "2.1.01"),
      ln("CREDIT", 5000, "ASSET", "1.1.01"),
    ]);
    const position = projectTreasuryPosition([offering, committed, payment]);

    expect(position.settledCashCents).toBe(5000);
    expect(position.committedExpenseCents).toBe(0);
    expect(position.settledCostCents).toBe(5000);
    expect(position.availableCents).toBe(5000);
    expect(position.availableCents).not.toBe(0);
  });

  it("soma centros de custo uma única vez", () => {
    const other = entry("e-missoes", "APPROVED", [
      ln("DEBIT", 2000, "ASSET", "1.1.01"),
      ln("CREDIT", 2000, "REVENUE", "4.1.01"),
    ], "cc-missoes");
    const total = projectTreasuryPosition([offering, other]);
    const culto = projectTreasuryPosition([offering, other], { costCenterId: "cc-culto" });
    const missoes = projectTreasuryPosition([offering, other], { costCenterId: "cc-missoes" });

    expect(culto.receivedRevenueCents).toBe(10000);
    expect(missoes.receivedRevenueCents).toBe(2000);
    expect(total.receivedRevenueCents).toBe(12000);
    expect(
      total.byCostCenter.reduce((sum, slice) => sum + slice.receivedRevenueCents, 0),
    ).toBe(total.receivedRevenueCents);
    expect(culto.excluded.OTHER_COST_CENTER).toBe(1);
  });

  it("deixa conta fora da convenção fora do caixa", () => {
    const loan = entry("e-emprestimo", "APPROVED", [
      ln("DEBIT", 4000, "ASSET", "1.1.01"),
      ln("CREDIT", 4000, "LIABILITY", "2.2.01"),
    ]);
    const position = projectTreasuryPosition([loan]);

    expect(position.settledCashCents).toBe(4000);
    expect(position.receivedRevenueCents).toBe(0);
    expect(position.committedExpenseCents).toBe(0);
    expect(position.unclassifiedCents).toBe(4000);
    expect(position.grossRevenueCents).toBe(0);
  });
});

describe("montagem de partidas", () => {
  it("recebe líquido e registra bruto e taxa sem desbalancear", () => {
    const lines = buildCashReceiptLines({
      cashAccountId: "caixa",
      revenueAccountId: "receita",
      feeAccountId: "taxa",
      grossCents: 10000,
      feeCents: 300,
    });
    const debit = lines.filter((item) => item.side === "DEBIT").reduce((sum, item) => sum + item.amountCents, 0);
    const credit = lines.filter((item) => item.side === "CREDIT").reduce((sum, item) => sum + item.amountCents, 0);
    expect(debit).toBe(credit);
    expect(lines.map((item) => item.memo)).toEqual([
      "treasury:cash",
      "treasury:fee",
      "treasury:gross",
    ]);
  });

  it("recusa taxa maior ou igual ao bruto", () => {
    expect(() =>
      buildCashReceiptLines({
        cashAccountId: "caixa",
        revenueAccountId: "receita",
        feeAccountId: "taxa",
        grossCents: 100,
        feeCents: 100,
      }),
    ).toThrow("FEE_EXCEEDS_GROSS");
  });

  it("recebível não movimenta caixa", () => {
    const lines = buildReceivableLines({
      receivableAccountId: "ar",
      revenueAccountId: "receita",
      grossCents: 8000,
    });
    expect(lines).toEqual([
      { accountId: "ar", side: "DEBIT", amountCents: 8000, memo: "treasury:receivable" },
      { accountId: "receita", side: "CREDIT", amountCents: 8000, memo: "treasury:gross" },
    ]);
  });

  it("compromisso não sai do caixa e a liquidação não relança a despesa", () => {
    expect(buildCommitmentLines({
      expenseAccountId: "desp",
      payableAccountId: "ap",
      amountCents: 5000,
    }).map((item) => item.memo)).toEqual(["treasury:expense", "treasury:payable"]);
    const settlement = buildSettlementLines({
      payableAccountId: "ap",
      cashAccountId: "caixa",
      amountCents: 5000,
    });
    expect(settlement.map((item) => item.memo)).toEqual([
      "treasury:settle-payable",
      "treasury:cash",
    ]);
    expect(settlement.some((item) => item.memo.includes("expense") || item.memo.includes("gross"))).toBe(false);
  });
});
