import { loadMonthState } from "./roster-month-load";

describe("Louvor: pesquisa do mês independente do Atmosfera", () => {
  it("não bloqueia o primeiro sorteio devido a respostas de outro ministério", async () => {
    const db = {
      ministryRosterModule: { findMany: async () => [{
        id: "louvor-equipe", name: "Banda", rules: {
          positions: { sunday_morning: [{ label: "Equipe de Louvor", count: 1, couple: false }] },
          volunteerIds: ["pessoa-a"],
        },
      }] },
      ministryRosterModuleMembership: { findMany: async () => [{
        moduleId: "louvor-equipe", personId: "pessoa-a",
      }] },
      ministryMembership: { findMany: async () => [{
        id: "vinculo-a", personId: "pessoa-a",
        person: { displayName: "Pessoa A", householdId: null },
      }] },
      roster: { findMany: async () => [{
        id: "escala-atmosfera", ministryId: "atmosfera", moduleId: "recepcao",
        serviceAt: new Date("2027-01-03T13:00:00Z"), status: "DRAFT", title: "Recepção",
        slots: [],
      }] },
      rosterAssignment: { findMany: async () => [] },
      rosterAvailabilityResponse: { findMany: async () => [{
        personId: "pessoa-a", rosterIds: ["escala-atmosfera"],
      }] },
      volunteerAvailability: { findMany: async () => [] },
      volunteerImpediment: { findMany: async () => [] },
      churchServiceOccurrence: { findMany: async () => [] },
      volunteerServingPreference: { findMany: async () => [] },
    };
    const pilot = { organizationId: "org", churchId: "riacho" };
    const louvor = await loadMonthState(db as never, pilot, "louvor-demo", "2027-01", "louvor-demo");
    expect(louvor?.monthlySurveyRequired).toBe(false);
    expect(louvor?.people[0].availableDates).toBeUndefined();
    expect(louvor?.modules[0].louvor).toBe(true);
    expect(louvor?.modules[0].volunteerIds).toEqual(["pessoa-a"]);
    const atmosfera = await loadMonthState(db as never, pilot, "atmosfera", "2027-01", "atmosfera");
    expect(atmosfera?.monthlySurveyRequired).toBe(true);
    expect(atmosfera?.people[0].availableDates).toEqual(["2027-01-03"]);
  });
});
