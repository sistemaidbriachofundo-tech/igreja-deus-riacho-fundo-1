import { calendarDay, isUnder18 } from "./memberships.service";

describe("Cadastro inicial de pessoa", () => {
  it("aceita data bissexta válida e rejeita datas impossíveis", () => {
    expect(calendarDay("2024-02-29", "Nascimento")?.toISOString().slice(0,10)).toBe("2024-02-29");
    expect(() => calendarDay("2025-02-29", "Nascimento")).toThrow();
    expect(() => calendarDay("2026-13-05", "Nascimento")).toThrow();
    expect(() => calendarDay("2999-01-01", "Nascimento")).toThrow();
    expect(calendarDay(undefined, "Nascimento")).toBeUndefined();
  });
  it("calcula idade no dia do aniversário em São Paulo", () => {
    expect(isUnder18(new Date("2008-11-12T00:00:00Z"),new Date("2026-11-11T22:00:00Z"))).toBe(true);
    expect(isUnder18(new Date("2008-11-11T00:00:00Z"),new Date("2026-11-11T22:00:00Z"))).toBe(false);
  });
});
