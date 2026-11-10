import { describe, expect, it } from "vitest";
import { barsFromCounts, costBars, participationBars } from "./report-charts";

describe("gráficos de relatório", () => {
  it("não desenha participação quando a soma não confere", () => {
    expect(participationBars({
      registrations: 3,
      cancelled: 1,
      checkedIn: 1,
      pendingPayment: 0,
      confirmedAwaitingPresence: 0,
      unclassified: 0,
    })).toBeNull();
  });

  it("desenha a participação quando as situações fecham o total", () => {
    expect(participationBars({
      registrations: 2,
      cancelled: 1,
      checkedIn: 1,
      pendingPayment: 0,
      confirmedAwaitingPresence: 0,
      unclassified: 0,
    })).toEqual([
      { label: "cancelled", value: 1 },
      { label: "checkedIn", value: 1 },
      { label: "pendingPayment", value: 0 },
      { label: "confirmedAwaitingPresence", value: 0 },
      { label: "unclassified", value: 0 },
    ]);
  });

  it("não promove série de custo sem conferência", () => {
    expect(costBars([{ label: "Jovens", expenseCents: 10 }], false)).toBeNull();
    expect(costBars([], true)).toBeNull();
  });

  it("recusa agregação com valor ausente", () => {
    expect(barsFromCounts({ ACTIVE: Number.NaN })).toBeNull();
  });
});
