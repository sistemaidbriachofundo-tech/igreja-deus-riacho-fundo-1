import { describe, expect, it } from "vitest";
import { summarizeTreasury, type TreasuryAccount, type TreasuryEntry, type TreasuryEntryLine } from "./treasury-overview";

const accounts: TreasuryAccount[] = [
  { id: "b", code: "1.1.10.01", name: "BRB", type: "ASSET" },
  { id: "c", code: "1.1.10.04", name: "Cora", type: "ASSET" },
  { id: "r", code: "1.2.20.01", name: "Cartões a liquidar", type: "ASSET" },
  { id: "d", code: "1.2.20.02", name: "Culto a depositar", type: "ASSET" },
  { id: "p", code: "4.2.10.01", name: "Pix", type: "REVENUE" },
  { id: "rc", code: "4.2.10.02", name: "Cartão", type: "REVENUE" },
  { id: "rd", code: "4.2.10.03", name: "Dinheiro", type: "REVENUE" },
  { id: "t", code: "5.9.10.01", name: "Taxas", type: "EXPENSE" },
];
const line = (accountId: string, side: TreasuryEntryLine["side"], cents: number) => ({ accountId, side, cents });
const entry = (id: string, entryDate: string, lines: TreasuryEntryLine[]): TreasuryEntry => ({
  id, entryDate, lines, description: id, status: "APPROVED", amountCents: null,
  createdByUserId: "fixture", firstApprovedByUserId: null, costCenterId: null, reconciliationId: null,
});

describe("Tesouraria por banco e canal", () => {
  it("separa a receita do dinheiro efetivamente depositado sem contar o rascunho", () => {
    const entries = [
      entry("pix", "2026-11-02", [line("b", "DEBIT", 50000), line("p", "CREDIT", 50000)]),
      entry("cartao", "2026-11-03", [line("r", "DEBIT", 100000), line("rc", "CREDIT", 100000)]),
      entry("baixa", "2026-11-06", [line("c", "DEBIT", 97000), line("t", "DEBIT", 3000), line("r", "CREDIT", 100000)]),
      entry("culto", "2026-11-08", [line("d", "DEBIT", 27000), line("rd", "CREDIT", 27000)]),
      entry("deposito-pendente", "2026-11-09", [line("b", "DEBIT", 27000), line("d", "CREDIT", 27000)]),
    ];
    const selected = entries.slice(0, 4).map(item => item.id);
    const summary = summarizeTreasury(accounts, entries, selected, { from: "2026-11-01", to: "2026-11-30" });
    expect(summary.banks.map(bank => bank.balance)).toEqual([50000, 97000]);
    expect(summary.recognized).toEqual({ pix: 50000, cartao: 100000, dinheiro: 27000, outras: 0 });
    expect(summary.pending).toEqual({ cartao: 0, dinheiro: 27000 });
    expect(summary.reconciled).toEqual({ cartao: 97000, dinheiro: 0 });
    expect(summary.cardFees).toBe(3000);

    const latePeriod = summarizeTreasury(accounts, entries, selected, { from: "2026-11-07", to: "2026-11-11" });
    expect(latePeriod.banks.map(bank => bank.balance)).toEqual([50000, 97000]);
    expect(latePeriod.recognized).toEqual({ pix: 0, cartao: 0, dinheiro: 27000, outras: 0 });
  });
});
