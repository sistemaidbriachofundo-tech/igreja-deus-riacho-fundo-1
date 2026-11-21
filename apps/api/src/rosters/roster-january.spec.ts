import { evaluateCandidate } from "./preview-domain/eligibility";
import { DEFAULT_RULES, type Candidate, type ExistingAssignment, type SlotDemand } from "./preview-domain/types";
import { churchDayKey, churchMonthRange } from "./church-day";
import { cultsInMonth, monthsReadyToFill, surveyIsOpen, surveyMonth } from "./roster-module-policy";
import { maintainRosterCycle } from "./roster-module-runtime";

describe("escala mensal de janeiro", () => {
  const rules = { ...DEFAULT_RULES, maxMonthlyAssignments: 1, minIntervalDays: 10, requireMonthlyAvailabilityResponse: true };
  const ana: Candidate = {
    personId: "ana", active: true, churchIds: ["riacho"], ministryIds: ["atmosfera"],
    qualifiedPositionIds: ["Recepção"], approvedRoleTags: [],
    availability: [{ weekday: 0, startMinute: 0, endMinute: 1440 }, { weekday: 4, startMinute: 0, endMinute: 1440 }],
    monthlyAvailableDays: ["2026-01-01", "2026-01-04", "2026-01-11", "2026-01-18"],
  };

  function slot(serviceAt: string, serviceType: SlotDemand["serviceType"]): SlotDemand {
    return {
      slotId: serviceAt, rosterId: "janeiro", churchId: "riacho", ministryId: "atmosfera", positionId: "Recepção",
      roleLabel: "Recepção", requiresCouple: false, serviceAt, serviceType,
    };
  }

  const december: ExistingAssignment = {
    assignmentId: "dez", churchId: "riacho", ministryId: "atmosfera", positionId: "Recepção", rosterId: "dezembro",
    slotId: "dez", serviceAt: "2025-12-28T22:00:00.000Z", status: "CONFIRMED", personId: "ana",
  };

  it("mantém os cultos de janeiro no mês civil e a pesquisa de 25 a 28 no mês seguinte", () => {
    for (const month of ["2026-01", "2027-01"]) {
      const range = churchMonthRange(month);
      const cults = cultsInMonth(month);
      expect(cults.length).toBeGreaterThan(0);
      expect(cults.every((cult) => cult.serviceAt >= range.gte && cult.serviceAt < range.lt)).toBe(true);
      expect(cults.every((cult) => churchDayKey(cult.serviceAt).startsWith(month))).toBe(true);
    }
    expect(cultsInMonth("2026-01")[0]).toMatchObject({ serviceType: "thursday_evening" });
    expect(churchDayKey(cultsInMonth("2026-01")[0].serviceAt)).toBe("2026-01-01");
    expect(surveyMonth(new Date("2025-12-25T15:00:00.000Z"))).toBe("2026-01");
    expect(surveyIsOpen(new Date("2025-12-25T15:00:00.000Z"))).toBe(true);
    expect(surveyIsOpen(new Date("2025-12-29T15:00:00.000Z"))).toBe(false);
    expect(monthsReadyToFill(new Date("2025-12-29T15:00:00.000Z"))).toEqual(["2025-12", "2026-01"]);
    expect(monthsReadyToFill(new Date("2026-01-01T15:00:00.000Z"))).toEqual(["2026-01"]);
    expect(surveyMonth(new Date("2026-12-25T15:00:00.000Z"))).toBe("2027-01");
    expect(monthsReadyToFill(new Date("2026-12-29T15:00:00.000Z"))).toEqual(["2026-12", "2027-01"]);
    expect(monthsReadyToFill(new Date("2027-01-01T15:00:00.000Z"))).toEqual(["2027-01"]);
  });

  it("não conta dezembro no limite de janeiro e aplica o intervalo de dez dias na virada", () => {
    const newYear = evaluateCandidate(ana, slot("2026-01-01T23:00:00.000Z", "thursday_evening"), [ana], [december], rules);
    const firstSunday = evaluateCandidate(ana, slot("2026-01-04T13:00:00.000Z", "sunday_morning"), [ana], [december], rules);
    const later = evaluateCandidate(ana, slot("2026-01-18T13:00:00.000Z", "sunday_morning"), [ana], [december], rules);
    expect(newYear.reasons).toContain("MIN_INTERVAL");
    expect(newYear.reasons).not.toContain("MONTHLY_LIMIT");
    expect(firstSunday.reasons).toContain("MIN_INTERVAL");
    expect(firstSunday.reasons).not.toContain("MONTHLY_LIMIT");
    expect(later.eligible).toBe(true);

    const firstOnly = evaluateCandidate(
      { ...ana, onlyFirstSunday: true, monthlyAvailableDays: ["2026-01-04", "2026-01-11"] },
      slot("2026-01-04T13:00:00.000Z", "sunday_morning"), [ana], [], { ...rules, minIntervalDays: 0, maxMonthlyAssignments: 3 },
    );
    const secondSunday = evaluateCandidate(
      { ...ana, onlyFirstSunday: true, monthlyAvailableDays: ["2026-01-04", "2026-01-11"] },
      slot("2026-01-11T13:00:00.000Z", "sunday_morning"), [ana], [], { ...rules, minIntervalDays: 0, maxMonthlyAssignments: 3 },
    );
    expect(firstOnly.eligible).toBe(true);
    expect(secondSunday.reasons).toContain("FIRST_SUNDAY_ONLY");
  });

  it("prepara janeiro uma vez depois do dia 28 e não grava fevereiro nessa virada", async () => {
    const rosters: Array<Record<string, unknown>> = [];
    const db = {
      ministryRosterModule: { findMany: async () => [{ id: "recepcao", name: "Recepção", ministryId: "atmosfera", rules: {} }] },
      ministryRosterModuleMembership: { findMany: async () => [] },
      roster: {
        findMany: async () => rosters,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `roster-${rosters.length}`, ...data };
          rosters.push(row);
          return row;
        },
      },
    };
    const now = new Date("2026-12-29T15:00:00.000Z");
    const first = await maintainRosterCycle(db as never, { organizationId: "org", churchId: "riacho" }, now);
    const second = await maintainRosterCycle(db as never, { organizationId: "org", churchId: "riacho" }, now);
    expect(first.prepared).toBeGreaterThan(0);
    expect(second.prepared).toBe(0);
    const months = rosters.map((row) => churchDayKey(row.serviceAt as Date).slice(0, 7));
    expect(new Set(months)).toEqual(new Set(["2026-12", "2027-01"]));
    expect(months).not.toContain("2027-02");
    expect(rosters.some((row) => churchDayKey(row.serviceAt as Date) === "2027-01-03" && row.serviceType === "sunday_morning")).toBe(true);
  });
});
