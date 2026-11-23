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
      create: async ({ data }: { data: { moduleId: string; slots?: { create?: unknown[] } } }) => {
        const id = `novo-${writes.length}`;
        writes.push(`roster:${data.moduleId}`);
        return { id, slots: (data.slots?.create ?? []).map((_, index) => ({ id: `${id}-slot-${index}` })) };
      },
      update: async () => { writes.push("roster-update"); throw new Error("culto publicado não pode ser reescrito aqui"); },
    },
    rosterSlot: {
      create: async ({ data }: { data: { rosterId: string } }) => { writes.push(`slot:${data.rosterId}`); return { id: `slot-${writes.length}` }; },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => { writes.push(`slot-delete:${where.id.in.join(",")}`); return { count: where.id.in.length }; },
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
    $executeRaw: async () => 1,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db, writes, published };
}

function serviceFor(db: object) {
  return new PersonalRosterService(db as never, { getPilotChurch: async () => ({ organizationId: ORG, churchId: CHURCH }) } as never);
}

describe("endpoints da simulação mensal", () => {
  it("reserva a simulação do Atmosfera ao líder do ministério e devolve casal elegível", async () => {
    const { db, writes } = database();
    const service = serviceFor(db);
    const leader = user("lider-atmosfera");
    const simulation = await service.monthlySimulation(leader, "atmosfera", { month: "2026-12", moduleId: "recepcao", fillOnlyOpen: true });
    expect(writes).toEqual([]);
    expect(simulation.rosters.every(roster => roster.moduleId === "recepcao")).toBe(true);
    expect(simulation.revision).toMatch(/^[a-f0-9]{64}$/);
    const choice = simulation.rosters.flatMap(roster => roster.positions).find(position => position.requiresCouple && !position.readOnly);
    expect(choice?.candidates.some(candidate => candidate.personId === "ana" && candidate.partnerPersonId === "bruno")).toBe(true);
    const moduleLeader = user("lider-recepcao");
    await expect(service.monthlySimulation(moduleLeader, "atmosfera", { month: "2026-12" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.monthlySimulation(moduleLeader, "atmosfera", { month: "2026-12", moduleId: "recepcao" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.saveMonth(moduleLeader, "atmosfera", "2026-12", { fingerprint: simulation.revision, moduleId: "recepcao" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.monthlySimulation(user("lider-outro", "louvor"), "atmosfera", { month: "2026-12" })).rejects.toBeInstanceOf(ForbiddenException);
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
    await expect(service.monthlySimulation(user("lider-atmosfera"), "atmosfera", { month: "2026-12", moduleId: "recepcao", revision: "b".repeat(64) })).rejects.toMatchObject({ response: { code: "ROSTER_PREVIEW_STALE" } });
  });

  it("aumenta a capacidade de um rascunho existente e conta só os cultos gravados", async () => {
    const { db, writes, published } = database();
    const service = serviceFor(db);
    const leader = user("lider-atmosfera");
    const simulation = await service.monthlySimulation(leader, "atmosfera", { month: "2026-12", moduleId: "recepcao" });
    const draft = simulation.rosters.find(roster => roster.id === "rascunho");
    const group = draft?.capacity?.[0];
    expect(group).toBeTruthy();
    const saved = await service.saveMonth(leader, "atmosfera", "2026-12", {
      fingerprint: simulation.revision, moduleId: "recepcao", fillOnlyOpen: true,
      capacities: [{ rosterId: "rascunho", groupId: group!.id, count: Math.min(30, group!.count + 1) }],
    });
    expect(writes).toContain("slot:rascunho");
    expect(writes.indexOf("assignment")).toBeGreaterThan(writes.indexOf("slot:rascunho"));
    expect(writes.some(item => item.startsWith("roster:conexao") || item === "roster-update")).toBe(false);
    const created = writes.filter(item => item.startsWith("roster:")).length;
    expect(saved.savedRosters).toBe(created + 1);
    expect(published.slots[0].assignments[0].personId).toBe("gabi");
    const open = simulation.rosters.find(roster => roster.id === "rascunho")?.positions[0];
    await expect(service.monthlySimulation(leader, "atmosfera", {
      month: "2026-12", moduleId: "recepcao", revision: simulation.revision,
      decisions: [{ slotId: open!.slotId, personId: "carla", locked: true }],
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: "ROSTER_NOT_ELIGIBLE", reasonCodes: expect.any(Array) }) });
  });

  it("reduz só a vaga vazia de um rascunho que já existe", async () => {
    const { db, writes, published } = database();
    const draft = (await db.roster.findMany()).find(roster => roster.id === "rascunho");
    draft?.slots.push({ id: "ocupada", roleLabel: "Recepção", requiresCouple: true, requiredQualification: null, assignments: [{ personId: "ana", partnerPersonId: "bruno", status: "CONFIRMED" }] });
    const service = serviceFor(db);
    const leader = user("lider-atmosfera");
    const simulation = await service.monthlySimulation(leader, "atmosfera", { month: "2026-12", moduleId: "recepcao" });
    const group = simulation.rosters.find(roster => roster.id === "rascunho")?.capacity?.[0];
    const saved = await service.saveMonth(leader, "atmosfera", "2026-12", {
      fingerprint: simulation.revision, moduleId: "recepcao", fillOnlyOpen: true,
      capacities: [{ rosterId: "rascunho", groupId: group!.id, count: 0 }],
    });
    expect(writes).toContain("slot-delete:vaga-rascunho");
    expect(writes.some(item => item.includes("ocupada"))).toBe(false);
    expect(saved.savedRosters).toBe(writes.filter(item => item.startsWith("roster:")).length + 1);
    expect(published.status).toBe("PUBLISHED");
  });
});
