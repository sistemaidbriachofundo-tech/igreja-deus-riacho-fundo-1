import { describe, expect, it } from "vitest";
import { buildMonthGrid, eventDayKey, filterAgenda, initialMonth } from "./calendar";

const sample = [
  { id: "a", name: "Culto de gratidão", status: "PUBLISHED", startsAt: "2026-12-06T19:00:00.000Z" },
  { id: "b", name: "Ensaio interno", status: "DRAFT", startsAt: "2026-12-20T18:00:00.000Z" },
  { id: "c", name: "Retiro", status: "PUBLISHED", startsAt: "2027-01-10T09:00:00.000Z" },
  { id: "d", name: "Sem data", status: "DRAFT", startsAt: "" },
];

describe("agenda de eventos", () => {
  it("coloca o encontro no dia local e ignora data inválida", () => {
    const day = eventDayKey(sample[0].startsAt);
    expect(day).toMatch(/^2026-12-0[67]$/);
    const grid = buildMonthGrid("2026-12", sample);
    expect(grid).toHaveLength(42);
    const hosted = grid.find((cell) => cell.events.some((event) => event.id === "a"));
    expect(hosted?.date).toBe(day);
    expect(grid.some((cell) => cell.events.some((event) => event.id === "d"))).toBe(false);
    expect(grid.some((cell) => cell.events.some((event) => event.id === "c"))).toBe(false);
  });

  it("filtra por nome, situação e mês sem inventar encontro", () => {
    expect(filterAgenda(sample, { query: "ensaio", status: "DRAFT", month: "2026-12" }).map((event) => event.id)).toEqual(["b"]);
    expect(filterAgenda(sample, { query: "culto", status: "DRAFT" })).toEqual([]);
    expect(filterAgenda(sample, { month: "2027-01" }).map((event) => event.id)).toEqual(["c"]);
    expect(initialMonth(sample)).toBe("2026-12");
    expect(initialMonth([])).toMatch(/^\d{4}-\d{2}$/);
  });
});
