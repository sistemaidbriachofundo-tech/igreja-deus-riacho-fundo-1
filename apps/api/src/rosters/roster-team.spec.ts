import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { createRosterMemberInvitation, inviteSlotCandidate, listRosterMemberInvitations, listSlotCandidates, respondRosterMemberInvitation, searchRosterInvitationPeople } from "./roster-team";

const pilot = { organizationId: "org", churchId: "riacho" };
const leader = { userId: "u", personId: "lider-recepcao", grants: [{ roleCode: "LIDER_MINISTERIO", organizationId: "org", churchId: "riacho", ministryId: "atmosfera" }] } as AuthUser;
const ana = { userId: "ua", personId: "ana", grants: [{ roleCode: "MEMBRO", organizationId: "org", churchId: "riacho" }] } as AuthUser;
const future = new Date("2026-12-06T13:00:00.000Z");

function database() {
  const invitations: Array<{ id: string; personId: string; moduleId: string; membershipId: string; ministryId: string; status: "PENDING" | "ACCEPTED" | "DECLINED"; organizationId: string }> = [];
  const links: Array<{ moduleId: string; personId: string; membershipId: string; status: string; endedAt: Date | null }> = [
    { moduleId: "recepcao", personId: "ana", membershipId: "mem-ana", status: "ATIVO", endedAt: null },
    { moduleId: "ofertas", personId: "ofertas", membershipId: "mem-ofertas", status: "ATIVO", endedAt: null },
  ];
  const notices: Array<{ id: string; kind: string; personId: string }> = [];
  const assignments: Array<{ id: string; slotId: string; personId: string; partnerPersonId: string | null; status: string }> = [];
  let upserts = 0;
  const slot = {
    id: "vaga", roleLabel: "Recepção", requiresCouple: false, requiredQualification: null, assignments,
    roster: {
      id: "culto", title: "Recepção", status: "PUBLISHED", serviceAt: future, ministryId: "atmosfera", moduleId: "recepcao",
      organizationId: "org", churchId: "riacho",
      ministry: { id: "atmosfera", leaderPersonId: "lider-atmosfera" },
      module: { id: "recepcao", name: "Recepção", rules: {} },
    },
  };
  const db = {
    ministry: { findFirst: async () => ({ id: "atmosfera", leaderPersonId: "lider-atmosfera" }) },
    ministryRosterModuleLeader: { findMany: async ({ where }: { where: { personId: string } }) => where.personId === "lider-recepcao" ? [{ moduleId: "recepcao" }] : [] },
    ministryRosterModule: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id, name: where.id === "conexao" ? "Conexão" : "Recepção", rules: {} }) },
    ministryMembership: {
      findFirst: async ({ where }: { where: { personId: string } }) => ({ id: `mem-${where.personId}`, personId: where.personId }),
      count: async () => 1,
      findMany: async () => [{ personId: "ana", person: { displayName: "Ana" } }, { personId: "ofertas", person: { displayName: "Ofertas" } }],
    },
    ministryRosterModuleMembership: {
      findFirst: async ({ where }: { where: { moduleId: string; personId: string; status: string } }) =>
        links.find(link => link.moduleId === where.moduleId && link.personId === where.personId && link.status === where.status && !link.endedAt) ?? null,
      findMany: async ({ where }: { where: { moduleId?: string | { in: string[] }; status?: string } }) => {
        const ids = typeof where.moduleId === "string" ? [where.moduleId] : where.moduleId?.in ?? [];
        return links.filter(link => (!ids.length || ids.includes(link.moduleId)) && (!where.status || link.status === where.status) && !link.endedAt);
      },
      upsert: async ({ create }: { create: { moduleId: string; personId: string; membershipId: string } }) => {
        upserts += 1;
        links.push({ ...create, status: "ATIVO", endedAt: null });
        return create;
      },
    },
    ministryRosterMemberInvitation: {
      findMany: async ({ where }: { where: { moduleId?: { in: string[] }; personId?: string } }) =>
        invitations.filter(item => !where.personId || item.personId === where.personId).filter(item => !where.moduleId || where.moduleId.in.includes(item.moduleId)),
      findFirst: async ({ where }: { where: { id?: string; moduleId?: string; personId?: string; status?: string } }) =>
        invitations.find(item => (!where.id || item.id === where.id) && (!where.moduleId || item.moduleId === where.moduleId) && (!where.personId || item.personId === where.personId) && (!where.status || item.status === where.status)) ?? null,
      create: async ({ data }: { data: typeof invitations[number] }) => {
        const row = { ...data, id: "convite-1" };
        invitations.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: "ACCEPTED" | "DECLINED" } }) => {
        const row = invitations.find(item => item.id === where.id);
        if (!row) throw new Error("missing");
        row.status = data.status;
        return row;
      },
    },
    person: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map(id => ({ id, displayName: id })) },
    rosterNotice: { createMany: async ({ data, skipDuplicates }: { data: Array<{ id: string; kind: string; personId: string }>; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const row of data) {
        if (skipDuplicates && notices.some(item => item.id === row.id)) continue;
        notices.push(row);
        count += 1;
      }
      return { count };
    } },
    rosterSlot: { findFirst: async ({ where }: { where?: { id?: string } }) => where?.id === "conexao"
      ? { ...slot, id: "conexao", roster: { ...slot.roster, moduleId: "conexao", module: { id: "conexao", name: "Conexão", rules: {} } } }
      : slot },
    rosterAvailabilityResponse: { findMany: async () => [] },
    volunteerAvailability: { findMany: async () => [{ personId: "ana", weekday: 0, startMinute: 180, endMinute: 1440 }] },
    volunteerImpediment: { findMany: async () => [] },
    rosterAssignment: {
      findMany: async () => [],
      findFirst: async () => assignments.find(item => item.status === "PENDING" || item.status === "CONFIRMED") ?? null,
      create: async ({ data }: { data: { slotId: string; personId: string; partnerPersonId: string | null; status: string } }) => {
        const row = { id: `asg-${assignments.length + 1}`, ...data };
        assignments.push(row);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db, invitations, notices, assignments, links, upserts: () => upserts, slot };
}

describe("convite de equipe e cobertura de vaga", () => {
  it("restringe o líder a um módulo, aceita uma vez e não repete o convite", async () => {
    const { db, notices, upserts } = database();
    await expect(createRosterMemberInvitation(db as never, leader, pilot, "atmosfera", { personId: "ana", moduleId: "conexao" })).rejects.toBeInstanceOf(ForbiddenException);
    const first = await createRosterMemberInvitation(db as never, leader, pilot, "atmosfera", { personId: "bruno", moduleId: "recepcao" });
    expect(first).toMatchObject({ status: "PENDING", moduleId: "recepcao" });
    await expect(createRosterMemberInvitation(db as never, leader, pilot, "atmosfera", { personId: "bruno", moduleId: "recepcao" })).resolves.toMatchObject({ id: first.id, status: "PENDING" });
    expect(notices.filter(item => item.kind === "module-invite")).toHaveLength(1);
    const accepted = await respondRosterMemberInvitation(db as never, { ...ana, personId: "bruno" } as AuthUser, pilot, first.id, "ACCEPTED");
    expect(accepted.status).toBe("ACCEPTED");
    expect(upserts()).toBe(1);
    await respondRosterMemberInvitation(db as never, { ...ana, personId: "bruno" } as AuthUser, pilot, first.id, "ACCEPTED");
    expect(upserts()).toBe(1);
    const listed = await listRosterMemberInvitations(db as never, leader, pilot, "atmosfera");
    expect(listed.invitations.every(item => item.moduleId === "recepcao")).toBe(true);
  });

  it("não cobre vaga preenchida, não vaza Ofertas e repete o mesmo convite", async () => {
    const { db, assignments, slot } = database();
    const open = await listSlotCandidates(db as never, leader, pilot, "vaga", new Date("2026-11-01T12:00:00.000Z"));
    expect(open.candidates.map(item => item.personId)).toEqual(["ana"]);
    const invited = await inviteSlotCandidate(db as never, leader, pilot, "vaga", { personId: "ana" }, new Date("2026-11-01T12:00:00.000Z"));
    expect(invited).toMatchObject({ personId: "ana", status: "PENDING" });
    const again = await inviteSlotCandidate(db as never, leader, pilot, "vaga", { personId: "ana" }, new Date("2026-11-01T12:00:00.000Z"));
    expect(again.assignmentId).toBe(invited.assignmentId);
    expect(assignments).toHaveLength(1);
    assignments[0].personId = "outra";
    slot.assignments = assignments;
    await expect(inviteSlotCandidate(db as never, leader, pilot, "vaga", { personId: "ana" }, new Date("2026-11-01T12:00:00.000Z"))).rejects.toBeInstanceOf(ConflictException);
    await expect(listSlotCandidates(db as never, leader, pilot, "conexao", new Date("2026-11-01T12:00:00.000Z"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("busca só quem o líder pode convidar para o próprio módulo", async () => {
    const people = [
      { id: "ana", displayName: "Ana Recepção", status: "ACTIVE", churchId: "riacho" },
      { id: "bruno", displayName: "Bruno Livre", status: "ACTIVE", churchId: "riacho" },
      { id: "carla", displayName: "Carla Pendente", status: "ACTIVE", churchId: "riacho" },
      { id: "diana", displayName: "Diana Outra Igreja", status: "ACTIVE", churchId: "outra" },
    ];
    const links = [{ moduleId: "recepcao", personId: "ana", status: "ATIVO", endedAt: null }];
    const invitations = [{ moduleId: "recepcao", personId: "carla", status: "PENDING" as const }];
    const members = [
      { personId: "ana", ministryId: "atmosfera", churchId: "riacho", organizationId: "org", status: "ATIVO", endedAt: null },
      { personId: "bruno", ministryId: "atmosfera", churchId: "riacho", organizationId: "org", status: "ATIVO", endedAt: null },
      { personId: "carla", ministryId: "atmosfera", churchId: "riacho", organizationId: "org", status: "ATIVO", endedAt: null },
      { personId: "diana", ministryId: "atmosfera", churchId: "outra", organizationId: "org", status: "ATIVO", endedAt: null },
    ];
    const db = {
      ministry: { findFirst: async () => ({ id: "atmosfera", leaderPersonId: "lider-atmosfera" }) },
      ministryRosterModuleLeader: { findMany: async ({ where }: { where: { personId: string } }) => where.personId === "lider-recepcao" ? [{ moduleId: "recepcao" }] : [] },
      ministryRosterModule: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
      ministryRosterModuleMembership: { findMany: async () => links },
      ministryRosterMemberInvitation: { findMany: async () => invitations },
      person: { findMany: async ({ where, take }: { where: { displayName: { contains: string }; id?: { notIn: string[] } }; take: number }) => {
        const excluded = new Set(where.id?.notIn ?? []);
        const term = where.displayName.contains.toLocaleLowerCase("pt-BR");
        return people.filter(person => person.displayName.toLocaleLowerCase("pt-BR").includes(term) && !excluded.has(person.id) && members.some(member => member.personId === person.id && member.churchId === "riacho")).slice(0, take).map(person => ({ id: person.id, displayName: person.displayName }));
      } },
    };
    await expect(searchRosterInvitationPeople(db as never, leader, pilot, "atmosfera", "conexao", "br", 8)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(searchRosterInvitationPeople(db as never, leader, pilot, "atmosfera", "recepcao", "b", 8)).resolves.toEqual({ hits: [] });
    await expect(searchRosterInvitationPeople(db as never, leader, pilot, "atmosfera", "recepcao", "br", 8)).resolves.toEqual({
      hits: [{ person: { id: "bruno", displayName: "Bruno Livre" } }],
    });
  });
});
