import { describe, expect, it } from "vitest";
import { pastoralMonthTick } from "./PastoralExecutiveDashboard";

describe("rótulo mensal da Mesa Pastoral", () => {
  it("mostra mês e ano curto e preserva um rótulo que não é AAAA-MM", () => {
    expect(pastoralMonthTick("2026-11")).toBe("11/26");
    expect(pastoralMonthTick("2026-01")).toBe("01/26");
    expect(pastoralMonthTick("Novembro")).toBe("Novembro");
  });
});
