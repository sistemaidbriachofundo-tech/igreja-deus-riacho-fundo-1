import { churchDayBounds, churchDayKey } from "./church-day";

describe("dia civil da congregação", () => {
  it("agrupa dois horários do mesmo dia em São Paulo e separa a virada", () => {
    const afternoon = new Date("2026-11-15T21:00:00.000Z");
    const evening = new Date("2026-11-15T23:30:00.000Z");
    const afterMidnight = new Date("2026-11-16T03:30:00.000Z");

    expect(churchDayKey(afternoon)).toBe("2026-11-15");
    expect(churchDayKey(evening)).toBe("2026-11-15");
    expect(churchDayKey(afterMidnight)).toBe("2026-11-16");

    const bounds = churchDayBounds(afternoon);
    expect(bounds.start.toISOString()).toBe("2026-11-15T03:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-11-16T03:00:00.000Z");
    expect(evening.getTime()).toBeGreaterThanOrEqual(bounds.start.getTime());
    expect(evening.getTime()).toBeLessThan(bounds.end.getTime());
    expect(afterMidnight.getTime()).toBeGreaterThanOrEqual(bounds.end.getTime());
  });
});
