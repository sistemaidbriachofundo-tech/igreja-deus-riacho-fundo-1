import { planMonth, presentMonthlySimulation, type MonthModule, type MonthState } from "./roster-month-plan";

const positions = [{ label: "Equipe de Louvor", count: 7, couple: false }];
const people = Array.from({ length: 34 }, (_, index) => ({
  personId: `louvor-${String(index + 1).padStart(2, "0")}`,
  name: `Integrante ${index + 1}`,
  ministryIds: ["louvor-demo"],
  availability: [],
  impediments: [],
}));

function state(extra: Partial<MonthState> = {}): MonthState {
  const module: MonthModule = {
    id: "modulo-louvor", name: "Banda", louvor: true, manual: false,
    minIntervalDays: 7, maxMonthlyAssignments: 4, volunteerIds: people.map(person => person.personId),
    positions: { thursday_evening: positions, sunday_morning: positions, sunday_evening: positions },
    qualifications: {}, couples: [],
  };
  return {
    month: "2027-01", churchId: "riacho", ministryId: "louvor-demo",
    calendar: [], modules: [module], people, rosters: [], history: [],
    monthlySurveyRequired: false,
    ...extra,
  };
}

describe("Louvor: sorteio completo do mês", () => {
  it("gera todos os cultos do mês mesmo antes da primeira pesquisa de disponibilidade", () => {
    const first = planMonth(state());
    const second = planMonth(state());
    expect(first.services).toHaveLength(14); // 4 quintas e 5 domingos (manhã/noite) em janeiro/2027
    expect(first.services.every(service => service.slots.length === 7)).toBe(true);
    expect(first.services.every(service => service.slots.some(slot => slot.personId))).toBe(true);
    expect(first.services.map(service => service.slots.map(slot => slot.personId)))
      .toEqual(second.services.map(service => service.slots.map(slot => slot.personId)));
  });

  it("não escala a mesma pessoa duas vezes no domingo nem ultrapassa o limite mensal", () => {
    const simulation = planMonth(state());
    const assignments = simulation.services.flatMap(service =>
      service.slots.filter(slot => slot.personId).map(slot => ({ personId: slot.personId!, at: service.serviceAt })));
    const januarySundays = simulation.services.filter(service => service.serviceType.startsWith("sunday"));
    for (const day of new Set(januarySundays.map(service => service.serviceAt.slice(0, 10)))) {
      const sameDay = januarySundays.filter(service => service.serviceAt.slice(0, 10) === day)
        .flatMap(service => service.slots.flatMap(slot => slot.personId ? [slot.personId] : []));
      expect(new Set(sameDay).size).toBe(sameDay.length);
    }
    for (const id of people.map(person => person.personId)) {
      expect(assignments.filter(assignment => assignment.personId === id).length).toBeLessThanOrEqual(4);
    }
  });

  it("preserva qualificações: não sorteia músico sem habilitação para instrumento", () => {
    const current = state();
    current.modules[0].positions.sunday_morning = [{ label: "Bateria", count: 1, couple: false, qualification: "bateria" }];
    current.modules[0].qualifications = { bateria: [people[0].personId] };
    const morning = planMonth(current).services.find(service => service.serviceType === "sunday_morning");
    expect(morning?.slots[0].personId).toBe(people[0].personId);
  });

  it("entrega prévia mensal com 14 cultos e opções editáveis sem repetir avaliação de vaga", () => {
    const preview = presentMonthlySimulation(state());
    expect(preview.rosters).toHaveLength(14);
    expect(preview.rosters[0].positions).toHaveLength(7);
    expect(preview.rosters[0].positions[0].candidates?.length).toBeGreaterThan(0);
    expect(preview.rosters[0].positions[1].candidates)
      .toEqual(preview.rosters[0].positions[0].candidates);
  });

  it("respeita a pesquisa mensal quando já foi respondida", () => {
    const current = state({ monthlySurveyRequired: true });
    const result = planMonth(current);
    expect(result.services.every(service => service.slots.every(slot => !slot.personId))).toBe(true);
    expect(result.services[0].slots[0].reasonCodes).toContain("MONTHLY_UNANSWERED");
  });
});
