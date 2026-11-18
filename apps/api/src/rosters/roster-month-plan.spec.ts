import { decideMonthSave, draftsToPersist, mergeChurchCalendar, planMonth, type MonthModule, type MonthState } from "./roster-month-plan";

const sundayMorning = "2026-12-06T13:00:00.000Z";
const sundayEvening = "2026-12-06T22:00:00.000Z";
const nextSunday = "2026-12-20T13:00:00.000Z";
const open = [{ weekday: 0, startMinute: 0, endMinute: 1440 }, { weekday: 4, startMinute: 0, endMinute: 1440 }];

function person(personId: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    personId, name, ministryIds: ["atmosfera"], availability: open, impediments: [], availableDates: ["2026-12-06", "2026-12-20"], ...extra,
  };
}

function moduleOf(id: string, name: string, positions: MonthModule["positions"], extra: Partial<MonthModule> = {}): MonthModule {
  return {
    id, name, manual: name === "Ceia", minIntervalDays: 10, maxMonthlyAssignments: 3, positions,
    volunteerIds: ["ana", "bruno", "carla", "diana", "edu", "felipe", "gabi"], couples: [["ana", "bruno"]],
    qualifications: { diaconia: ["gabi"] }, ...extra,
  };
}

function state(extra: Partial<MonthState> = {}): MonthState {
  return {
    month: "2026-12", churchId: "riacho", ministryId: "atmosfera", calendar: [],
    modules: [moduleOf("recepcao", "Recepção", { sunday_morning: [{ label: "Recepção", count: 1, couple: false }, { label: "Recepção", count: 1, couple: false, qualification: "diaconia" }], sunday_evening: [{ label: "Recepção", count: 1, couple: false }] })],
    people: [
      person("ana", "Ana", { householdId: "casa-1" }),
      person("bruno", "Bruno", { householdId: "casa-1" }),
      person("carla", "Carla", { householdId: "casa-1" }),
      person("diana", "Diana"),
      person("edu", "Edu", { impediments: [{ startsAt: "2026-12-06T00:00:00.000Z", endsAt: "2026-12-07T00:00:00.000Z" }] }),
      person("felipe", "Felipe", { availableDates: undefined }),
      person("gabi", "Gabi"),
    ],
    rosters: [],
    history: [{
      assignmentId: "outra", churchId: "riacho", ministryId: "louvor", positionId: "Voz", rosterId: "louvor", slotId: "voz",
      serviceAt: sundayMorning, status: "PENDING", personId: "diana",
    }],
    ...extra,
  };
}

describe("simulação mensal do Atmosfera", () => {
  it("mostra o mês inteiro sem gravar culto faltante e preserva publicado e cancelado", () => {
    const current = state({
      calendar: [{ serviceAt: sundayEvening, serviceType: "sunday_evening", status: "CANCELLED", title: "Sem culto" }],
      rosters: [{ id: "publicado", moduleId: "recepcao", serviceAt: nextSunday, status: "PUBLISHED", title: "Já publicado", slots: [
        { id: "fixa", roleLabel: "Recepção", requiresCouple: false, personId: "gabi" },
      ] }],
    });
    const first = planMonth(current);
    const second = planMonth(current);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.services.some(service => service.persisted === false && service.status === "MISSING")).toBe(true);
    expect(first.services.find(service => service.serviceAt === sundayEvening)?.status).toBe("CANCELLED");
    expect(first.services.find(service => service.rosterId === "publicado")?.slots[0]).toMatchObject({ personId: "gabi", locked: true });
    expect(mergeChurchCalendar("2026-12", []).some(item => item.serviceType === "thursday_evening")).toBe(true);
  });

  it("não escolhe indisponível, impedido, sem pesquisa ou quem já serve no mesmo dia", () => {
    const simulation = planMonth(state());
    const morning = simulation.services.find(service => service.serviceAt === sundayMorning && service.moduleId === "recepcao");
    const chosen = morning?.slots.flatMap(slot => [slot.personId, slot.partnerPersonId]).filter(Boolean);
    expect(chosen).not.toContain("diana");
    expect(chosen).not.toContain("edu");
    expect(chosen).not.toContain("felipe");
    const diaconia = morning?.slots.find(slot => slot.requiredQualification === "diaconia");
    expect(diaconia?.personId === "gabi" || diaconia?.reasonCodes.includes("ROLE_NOT_APPROVED") || diaconia?.personId === undefined || diaconia?.personId === "gabi").toBe(true);
    expect(morning?.slots.filter(slot => !slot.personId).every(slot => slot.reasonCodes.length > 0 && slot.openVacancy)).toBe(true);
  });

  it("fixa dois nomes, recalcula só o restante e repete a gravação sem duplicar", () => {
    const current = state();
    const preview = planMonth(current);
    const openSlot = preview.services.find(service => service.serviceAt === nextSunday)?.slots[0];
    expect(openSlot).toBeTruthy();
    const pins = [
      { serviceKey: `recepcao:${sundayMorning}`, slotKey: preview.services.find(service => service.serviceAt === sundayMorning)!.slots[0].key, personId: "ana" },
      { serviceKey: `recepcao:${nextSunday}`, slotKey: openSlot!.key, personId: "bruno" },
    ];
    const decision = decideMonthSave(current, { fingerprint: preview.fingerprint, pins, recalculate: true });
    expect(decision.action).toBe("write");
    if (decision.action !== "write") return;
    const saved = state({
      rosters: decision.simulation.services.filter(service => service.status !== "CANCELLED").map(service => ({
        id: service.rosterId ?? service.key, moduleId: service.moduleId, serviceAt: service.serviceAt, status: "DRAFT" as const, title: service.title,
        slots: service.slots.map(slot => ({ id: slot.key, roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple, requiredQualification: slot.requiredQualification, personId: slot.personId, partnerPersonId: slot.partnerPersonId })),
      })),
    });
    const replay = decideMonthSave(saved, { fingerprint: preview.fingerprint, pins, recalculate: true });
    expect(replay.action).toBe("replay");
    const changed = state({ history: [...current.history, { ...current.history[0], assignmentId: "concorrente", personId: "ana", serviceAt: nextSunday }] });
    expect(decideMonthSave(changed, { fingerprint: preview.fingerprint, pins }).action).toBe("stale");
  });

  it("mantém a família fora do outro horário e deixa a ceia manual", () => {
    const withCeia = state({
      modules: [
        moduleOf("recepcao", "Recepção", { sunday_morning: [{ label: "Recepção", count: 1, couple: false }], sunday_evening: [{ label: "Recepção", count: 1, couple: false }] }, { volunteerIds: ["ana", "carla"], couples: [] }),
        moduleOf("ceia", "Ceia", { sunday_morning: [{ label: "Ceia", count: 4, couple: false }] }, { manual: true, volunteerIds: ["ana"] }),
      ],
    });
    const simulation = planMonth(withCeia);
    const morning = simulation.services.find(service => service.moduleId === "recepcao" && service.serviceAt === sundayMorning);
    const evening = simulation.services.find(service => service.moduleId === "recepcao" && service.serviceAt === sundayEvening);
    const ceia = simulation.services.find(service => service.moduleId === "ceia" && service.serviceAt === sundayMorning);
    if (morning?.slots[0].personId === "ana") expect(evening?.slots[0].personId).not.toBe("carla");
    if (morning?.slots[0].personId === "carla") expect(evening?.slots[0].personId).not.toBe("ana");
    expect(ceia?.slots.every(slot => !slot.personId && slot.reasonCodes.includes("MANUAL_SUBSTITUTION"))).toBe(true);
    expect(draftsToPersist(simulation).some(item => item.service.status === "PUBLISHED" || item.service.moduleId === "ceia")).toBe(false);
    expect(simulation.services.some(service => service.moduleId === "conexao")).toBe(false);
  });

  it("rejeita pin inelegível e culto publicado", () => {
    const current = state();
    const preview = planMonth(current);
    const slot = preview.services.find(service => service.serviceAt === sundayMorning)!.slots[0];
    expect(decideMonthSave(current, { fingerprint: preview.fingerprint, pins: [{ serviceKey: `recepcao:${sundayMorning}`, slotKey: slot.key, personId: "diana" }] }).action).toBe("ineligible");
    const published = state({ rosters: [{ id: "pub", moduleId: "recepcao", serviceAt: sundayMorning, status: "PUBLISHED", title: "Publicado", slots: [{ id: "s", roleLabel: "Recepção", requiresCouple: false }] }] });
    const publishedPreview = planMonth(published);
    expect(decideMonthSave(published, { fingerprint: publishedPreview.fingerprint, pins: [{ serviceKey: `recepcao:${sundayMorning}`, slotKey: "s", personId: "ana" }] }).action).toBe("published");
  });
});
