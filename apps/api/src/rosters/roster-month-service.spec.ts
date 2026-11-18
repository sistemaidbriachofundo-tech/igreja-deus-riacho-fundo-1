import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { PersonalRosterService } from "./personal-roster.service";

const ORG = "org";
const CHURCH = "riacho";
const sunday = new Date("2026-12-06T13:00:00.000Z");

function user(personId: string, ministryId?: string): AuthUser {
  return {
    userId: personId, personId, email: `${personId}@example.test`,
    grants: [{ roleCode: "LIDER_MINISTERIO", organizationId: ORG, churchId: CHURCH, ministryId: ministryId ?? "atmosfera" }],
  };
}

function database() {
  const published = {
    id: "publicado", ministryId: "atmosfera", moduleId: "conexao", title: "Já publicado", serviceAt: sunday, status: "PUBLISHED",
    slots: [{ id: "vaga-publicada", roleLabel: "Recepção", requiresCouple: true, requiredQualification: null, assignments: [{ personId: "gabi", partnerPersonId: "hugo", status: "CONFIRMED" }] }],
  };
  const draft = {
    id: "rascunho", ministryId: "atmosfera", moduleId: "recepcao", title: "Rascunho", serviceAt: sunday, status: "DRAFT",
    slots: [{ id: "vaga-rascunho", roleLabel: "Recepção", requiresCouple: true, requiredQualification: null, assignments: [] }],
  };
  const writes: string[] = [];
  const modules = [
    { id: "recepcao", name: "Recepção", rules: { volunteerIds: ["ana", "bruno"], couples: [["ana", "bruno"]], positions: { sunday_morning: [{ label: "Recepção", count: 1, couple: true }] } } },
    { id: "conexao", name: "Conexão", rules: { volunteerIds: ["carla"], positions: { sunday_morning: [{ label: "Conexão", count: 1, couple: false }] } } },
  ];
  const db = {
    ministry: { findFirst: async () => ({ id: "atmosfera", name: "Atmosfera", slug: "atmosfera", leaderPersonId: "lider-atmosfera", organizationId: ORG, churchId: CHURCH }) },
    ministryRosterModuleLeader: { findMany: async ({ where }: { where: { personId: string } }) => where.personId === "lider-recepcao" ? [{ moduleId: "recepcao", ministryId: "atmosfera" }] : [] },
    ministryRosterModule: { findMany: async () => modules },
    ministryMembership: { findMany: async () => ["ana", "bruno", "carla", "gabi", "hugo"].map(personId => ({ personId, person: { displayName: personId, householdId: null, status: "ACTIVE" } })) },
    roster: {
      findMany: async () => [published, draft],
      create: async ({ data }: { data: { moduleId: string } }) => { writes.push(`roster:${data.moduleId}`); return { id: "novo", slots: [] }; },
      update: async () => { writes.push("roster-update"); throw new Error("culto publicado não pode ser reescrito aqui"); },
    },
    rosterAssignment: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async () => { writes.push("assignment"); return { id: "asg" }; },
    },
    rosterAvailabilityResponse: { findMany: async () => [{ personId: "ana", rosterIds: ["rascunho"] }, { personId: "bruno", rosterIds: ["rascunho"] }] },
    volunteerAvailability: { findMany: async () => ["ana", "bruno", "carla"].map(personId => ({ personId, weekday: 0, startMinute: 780, endMinute: 1440 })) },
    volunteerImpediment: { findMany: async () => [] },
    rosterNotice: { create: async () => { writes.push("notice"); } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db, writes, published };
}

function serviceFor(db: object) {
  return new PersonalRosterService(db as never, { getPilotChurch: async () => ({ organizationId: ORG, churchId: CHURCH }) } as never);
}

describe("endpoints da simulação mensal", () => {
  it("simula sem gravar, devolve casal elegível e restringe o líder a um módulo", async () => {
    const { db, writes } = database();
    const service = serviceFor(db);
    const leader = user("lider-recepcao");
    const simulation = await service.monthlySimulation(leader, "atmosfera", { month: "2026-12", fillOnlyOpen: true });
    expect(writes).toEqual([]);
    expect(simulation.rosters.every(roster => roster.moduleId === "recepcao")).toBe(true);
    expect(simulation.revision).toMatch(/^[a-f0-9]{64}$/);
    const choice = simulation.rosters.flatMap(roster => roster.positions).find(position => position.requiresCouple && !position.readOnly);
    expect(choice?.candidates.some(candidate => candidate.personId === "ana" && candidate.partnerPersonId === "bruno")).toBe(true);
    await expect(service.monthlySimulation(leader, "atmosfera", { month: "2026-12", moduleId: "conexao" })).rejects.toBeInstanceOf(ForbiddenException);
    const whole = await service.monthlySimulation(user("lider-atmosfera"), "atmosfera", { month: "2026-12" });
    expect(whole.rosters.find(roster => roster.status === "PUBLISHED")?.positions[0]).toMatchObject({ personId: "gabi", partnerPersonId: "hugo", readOnly: true });
    expect(writes).toEqual([]);
  });

  it("rejeita revisão vencida e não altera culto publicado", async () => {
    const { db, writes, published } = database();
    const service = serviceFor(db);
    await expect(service.saveMonth(user("lider-atmosfera"), "atmosfera", "2026-12", { fingerprint: "a".repeat(64), fillOnlyOpen: true })).rejects.toBeInstanceOf(ConflictException);
    expect(writes).toEqual([]);
    expect(published.status).toBe("PUBLISHED");
    expect(published.slots[0].assignments[0]).toMatchObject({ personId: "gabi", partnerPersonId: "hugo" });
  });
});
