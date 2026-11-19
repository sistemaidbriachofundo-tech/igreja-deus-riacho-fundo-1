import { ForbiddenException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthUser } from "../auth/types/auth-user";
import { planModuleConsolidation } from "./roster-module-key";
import { concurrentAcceptDecision } from "./roster-substitution-invites";
import {
  aggregateResponses,
  buildCapacityGroups,
  capacityGroupId,
  cultsInMonth,
  effectiveInviteLimit,
  explicitModuleLinks,
  formalRoleGrantsRosterAccess,
  invitePresentation,
  leadershipSummaryDue,
  moduleLeaderBlockedFromFinance,
  monthsReadyToFill,
  openVacancyText,
  planCapacityChange,
  projectVolunteerIds,
  publicPermissions,
  resolveRosterAccess,
  responseStatuses,
  rosterInScope,
  standardPositions,
  surveyIsOpen,
  surveyMonth,
  weeklyConfirmationDue,
  whatsappDevApproved,
} from "./roster-module-policy";
import { applyCapacity, assertModuleFinance, assertModuleLeaderCash, maintainRosterCycle, patchMembershipModules, positionsForModule } from "./roster-module-runtime";
import { assertSlotEligibility } from "./roster-operating-rules";

const pilot = { organizationId: "org", churchId: "riacho" };
const atmosfera = { id: "atmosfera", leaderPersonId: "lider-atmosfera" };

function user(personId: string, role: string, ministryId?: string): AuthUser {
  return {
    userId: `usr-${personId}`, personId, email: `${personId}@example.test`,
    grants: [{ roleCode: role as AuthUser["grants"][number]["roleCode"], organizationId: pilot.organizationId, churchId: pilot.churchId, ministryId: ministryId ?? null }],
  };
}

describe("escalas do Atmosfera", () => {
  it("separa líder de Recepção, líder do ministério, secretaria e voluntário", async () => {
    const reception = resolveRosterAccess({ churchWide: false, ministryLeader: false, ledModuleIds: ["recepcao"] });
    const ministry = resolveRosterAccess({ churchWide: false, ministryLeader: true, ledModuleIds: ["recepcao"] });
    const secretaria = resolveRosterAccess({ churchWide: true, ministryLeader: false, ledModuleIds: [] });
    const volunteer = resolveRosterAccess({ churchWide: false, ministryLeader: false, ledModuleIds: [] });
    expect(publicPermissions(reception)).toEqual({ scope: "modules", manageModuleMemberships: true });
    expect(rosterInScope("conexao", reception)).toBe(false);
    expect(rosterInScope("recepcao", reception)).toBe(true);
    expect(publicPermissions(ministry).scope).toBe("ministry");
    expect(rosterInScope("conexao", ministry)).toBe(true);
    expect(publicPermissions(secretaria)).toEqual({ scope: "ministry", manageModuleMemberships: true });
    expect(moduleLeaderBlockedFromFinance(reception, false)).toBe(true);
    const cash = {
      ministryRosterModuleLeader: { findMany: async () => [{ moduleId: "recepcao", ministryId: "atmosfera" }] },
      ministry: { findMany: async () => [{ id: "atmosfera", leaderPersonId: "lider-atmosfera" }] },
    };
    await expect(assertModuleFinance(cash as never, user("lider-recepcao", "LIDER_MINISTERIO", "atmosfera"), atmosfera, pilot)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertModuleLeaderCash(cash as never, user("lider-recepcao", "LIDER_MINISTERIO", "atmosfera"), pilot)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertModuleFinance(cash as never, user("lider-atmosfera", "LIDER_MINISTERIO", "atmosfera"), atmosfera, pilot)).resolves.toBeUndefined();
    expect(moduleLeaderBlockedFromFinance(ministry, false)).toBe(false);
    expect(moduleLeaderBlockedFromFinance(volunteer, false)).toBe(false);
    expect(formalRoleGrantsRosterAccess("DIACONO")).toBe(false);
    expect(formalRoleGrantsRosterAccess("LIDER")).toBe(false);
  });

  it("projeta a equipe ativa, inclusive vazia, e migra só vínculos explícitos", () => {
    expect(projectVolunteerIds({ positions: {} }, [])).toMatchObject({ volunteerIds: [] });
    const memberships = [
      { id: "mem-a", ministryId: "atmosfera", personId: "a", status: "ATIVO", endedAt: null, churchId: "riacho", organizationId: "org" },
      { id: "mem-b", ministryId: "atmosfera", personId: "b", status: "ATIVO", endedAt: null, churchId: "riacho", organizationId: "org" },
      { id: "mem-c", ministryId: "atmosfera", personId: "c", status: "ENCERRADO", endedAt: new Date(), churchId: "riacho", organizationId: "org" },
    ];
    const active = new Set(["a", "b", "c"]);
    const once = explicitModuleLinks([
      { id: "recepcao", ministryId: "atmosfera", rules: { volunteerIds: ["a", "a"] } },
      { id: "conexao", ministryId: "atmosfera", rules: { qualifications: { diaconia: ["b"] } } },
      { id: "ofertas", ministryId: "atmosfera", rules: { volunteerIds: ["c"] } },
    ], memberships, active);
    expect(once.map(link => [link.moduleId, link.personId])).toEqual([["recepcao", "a"]]);
    const again = explicitModuleLinks([
      { id: "recepcao", ministryId: "atmosfera", rules: { volunteerIds: ["a"] } },
    ], memberships, active);
    const stored = new Map(once.map(link => [`${link.membershipId}:${link.moduleId}`, link]));
    for (const link of again) stored.set(`${link.membershipId}:${link.moduleId}`, stored.get(`${link.membershipId}:${link.moduleId}`) ?? link);
    expect([...stored.values()]).toHaveLength(1);
  });

  it("aplica as quantidades dos cultos e preserva exceção já cadastrada", () => {
    expect(standardPositions("Recepção", "thursday_evening", {}).map(item => [item.count, item.qualification ?? ""])).toEqual([[2, ""], [1, "diaconia"]]);
    expect(standardPositions("Recepção", "sunday_morning", {}).reduce((sum, item) => sum + item.count, 0)).toBe(3);
    expect(standardPositions("Recepção", "sunday_evening", {}).reduce((sum, item) => sum + (item.qualification === "diaconia" ? item.count : 0), 0)).toBe(2);
    expect(standardPositions("Apoio Interno", "sunday_morning", {})).toMatchObject([{ count: 1 }]);
    expect(standardPositions("Conexão", "thursday_evening", {})).toMatchObject([{ count: 2, couple: false }]);
    expect(standardPositions("Ofertas e Maquininhas", "thursday_evening", {}).map(item => [item.couple, item.qualification ?? ""])).toEqual([[true, ""], [false, "diaconia"]]);
    expect(standardPositions("Ofertas e Maquininhas", "sunday_evening", {})).toMatchObject([{ count: 2, couple: true }]);
    expect(standardPositions("Ceia", "sunday_morning", { communionStages: 2 }).map(item => item.count)).toEqual([4, 4]);
    expect(standardPositions("Ceia", "sunday_morning", { communionStages: 0 })).toEqual([]);
    const custom = [{ label: "Exceção", count: 9, couple: false }];
    expect(positionsForModule("Recepção", "sunday_morning", { positions: { sunday_morning: custom } })).toEqual(custom);
    expect(cultsInMonth("2026-11").filter(cult => cult.serviceType === "thursday_evening").every(cult => cult.serviceAt.getUTCHours() === 23)).toBe(true);
    expect(cultsInMonth("2026-11").some(cult => cult.serviceType === "sunday_morning" && cult.serviceAt.getUTCHours() === 13)).toBe(true);
    expect(surveyMonth(new Date("2026-11-25T13:00:00Z"))).toBe("2026-12");
    expect(surveyIsOpen(new Date("2026-11-25T13:00:00Z"))).toBe(true);
    expect(surveyIsOpen(new Date("2026-11-29T13:00:00Z"))).toBe(false);
    expect(monthsReadyToFill(new Date("2026-11-26T13:00:00Z"))).toEqual(["2026-11"]);
    expect(monthsReadyToFill(new Date("2026-11-29T13:00:00Z"))).toEqual(["2026-11", "2026-12"]);
    expect(effectiveInviteLimit("Recepção", {}, 0)).toBe(5);
    expect(effectiveInviteLimit("Ceia", {}, 0)).toBe(0);
    expect(effectiveInviteLimit("Recepção", { substituteInviteLimit: 9 }, 5)).toBe(5);
  });

  it("não reduz quantidade abaixo da designação ativa e não altera outro culto", () => {
    const id = capacityGroupId("Recepção", false, "diaconia");
    const groups = buildCapacityGroups({
      positions: [{ label: "Recepção", count: 2, couple: false, qualification: "diaconia" }],
      slots: [
        { id: "cheia", roleLabel: "Recepção", requiresCouple: false, requiredQualification: "diaconia", active: true },
        { id: "vazia", roleLabel: "Recepção", requiresCouple: false, requiredQualification: "diaconia", active: false },
      ],
      overrides: new Map(),
    });
    expect(groups[0]).toMatchObject({ id, defaultCount: 2, count: 2, minimumCount: 1 });
    expect(() => planCapacityChange({
      groups, requested: [{ id, count: 0 }],
      slots: [
        { id: "cheia", groupId: id, active: true, sortOrder: 1 },
        { id: "vazia", groupId: id, active: false, sortOrder: 2 },
      ],
    })).toThrow(/designações ativas/);
    expect(planCapacityChange({
      groups, requested: [{ id, count: 1 }],
      slots: [
        { id: "cheia", groupId: id, active: true, sortOrder: 1 },
        { id: "vazia", groupId: id, active: false, sortOrder: 2 },
      ],
    }).removeIds).toEqual(["vazia"]);
  });

  it("fecha uma vaga com as respostas individuais do casal e preserva o histórico", () => {
    const history = [{ personId: "a", status: "CONFIRMED", createdAt: new Date("2026-11-01T00:00:00Z") }];
    expect(aggregateResponses(["a", "b"], new Map([["a", "CONFIRMED"]]))).toBe("PENDING");
    expect(aggregateResponses(["a", "b"], new Map([["a", "CONFIRMED"], ["b", "DECLINED"]]))).toBe("DECLINED");
    expect(aggregateResponses(["a", "b"], new Map([["a", "CONFIRMED"], ["b", "CONFIRMED"]]))).toBe("CONFIRMED");
    expect(responseStatuses({
      actorId: "b", personId: "a", partnerPersonId: "b", assignmentStatus: "PENDING", history,
    })).toEqual({ ownResponseStatus: "PENDING", companionResponseStatus: "CONFIRMED" });
    expect(history).toHaveLength(1);
  });

  it("explica a vaga aberta e só libera WhatsApp no canal de DEV aprovado", () => {
    expect(openVacancyText(["COUPLE_NOT_ELIGIBLE"])).toMatch(/dois integrantes do casal/);
    expect(openVacancyText(["MIN_INTERVAL"])).toMatch(/10 dias/);
    expect(whatsappDevApproved({ WHATSAPP_PROVIDER: "noop", ROSTER_WHATSAPP_DEV_APPROVED: "true" })).toBe(false);
    expect(whatsappDevApproved({ WHATSAPP_PROVIDER: "mock" })).toBe(false);
    expect(whatsappDevApproved({ WHATSAPP_PROVIDER: "mock", ROSTER_WHATSAPP_DEV_APPROVED: "true" })).toBe(true);
    expect(invitePresentation({ title: "Convite", body: "Culto", expiresAt: null, inviteStatus: "open" })).toMatchObject({
      title: "Convite", body: "Culto", inviteStatus: "open",
    });
  });

  it("dispara o resumo na segunda e na quinta às 9h de Brasília", () => {
    expect(leadershipSummaryDue(new Date("2026-11-16T12:10:00Z"))).toBe(true);
    expect(weeklyConfirmationDue(new Date("2026-11-16T12:10:00Z"))).toBe(true);
    expect(leadershipSummaryDue(new Date("2026-11-19T12:10:00Z"))).toBe(true);
    expect(weeklyConfirmationDue(new Date("2026-11-19T12:10:00Z"))).toBe(false);
    expect(leadershipSummaryDue(new Date("2026-11-16T13:00:00Z"))).toBe(false);
  });

  it("rejeita o segundo aceite concorrente e mantém uma única vaga", () => {
    expect(concurrentAcceptDecision(null, "nova", "declinada")).toBe("open");
    expect(concurrentAcceptDecision({ personId: "outra", status: "CONFIRMED", substituteForId: "declinada" }, "nova", "declinada")).toBe("taken");
    expect(concurrentAcceptDecision({ personId: "nova", status: "CONFIRMED", substituteForId: "declinada" }, "nova", "declinada")).toBe("idempotent");
  });

  it("exige os dois integrantes do casal na equipe normalizada", async () => {
    const tx = {
      ministryRosterModule: { findFirst: jest.fn().mockResolvedValue({ rules: { volunteerIds: ["a", "b"], couples: [["a", "b"]] } }) },
      ministryRosterModuleMembership: { findMany: jest.fn().mockResolvedValue([{ personId: "a" }]) },
      ministryMembership: { count: jest.fn().mockResolvedValue(1) },
    };
    await expect(assertSlotEligibility(tx as never, {
      requiresCouple: true, requiredQualification: null,
      roster: { moduleId: "recepcao", ministryId: "atmosfera", churchId: "riacho" },
    }, ["a", "b"])).rejects.toMatchObject({ response: { code: "ROSTER_MODULE_TEAM_REQUIRED" } });
  });

  it("altera só os módulos autorizados e reflete a equipe na leitura", async () => {
    const links: Array<Record<string, unknown>> = [
      { membershipId: "mem", moduleId: "conexao", personId: "voluntario", status: "ATIVO", endedAt: null },
    ];
    const db = {
      ministryRosterModuleLeader: { findMany: async () => [{ moduleId: "recepcao" }] },
      ministryMembership: { findFirst: async () => ({
        id: "mem", churchId: "riacho", organizationId: "org", status: "ATIVO", endedAt: null, personId: "voluntario", person: { status: "ACTIVE" },
      }) },
      ministryRosterModule: { findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        [{ id: "recepcao", rules: {} }, { id: "conexao", rules: {} }].filter(module => where.id.in.includes(module.id)) },
      ministryRosterModuleMembership: {
        findMany: async () => links.filter(link => link.status === "ATIVO"),
        upsert: async ({ create }: { create: Record<string, unknown> }) => { links.push({ ...create, status: "ATIVO", endedAt: null }); },
        updateMany: async () => ({ count: 0 }),
      },
    };
    const saved = await patchMembershipModules(db as never, user("lider-recepcao", "LIDER_MINISTERIO", "atmosfera"), pilot, atmosfera, "mem", {
      addModuleIds: ["recepcao"], removeModuleIds: [],
    });
    expect(saved.moduleIds).toEqual(expect.arrayContaining(["recepcao", "conexao"]));
    await expect(patchMembershipModules(db as never, user("lider-recepcao", "LIDER_MINISTERIO", "atmosfera"), pilot, atmosfera, "mem", {
      addModuleIds: ["conexao"], removeModuleIds: [],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("prepara rascunhos sem duplicar na reexecução", async () => {
    const rosters: Array<Record<string, unknown>> = [];
    const db = {
      ministryRosterModule: { findMany: async () => [{ id: "conexao", name: "Conexão", ministryId: "atmosfera", rules: {} }] },
      ministryRosterModuleMembership: { findMany: async () => [{ moduleId: "conexao", personId: "voluntario" }] },
      roster: {
        findMany: async () => rosters,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: `roster-${rosters.length}`, ...data }),
      },
      rosterAssignment: { create: async () => ({ id: "asg" }) },
    };
    const now = new Date("2026-11-20T15:00:00Z");
    const first = await maintainRosterCycle(db as never, pilot, now);
    const second = await maintainRosterCycle(db as never, pilot, now);
    expect(first.prepared).toBeGreaterThan(0);
    expect(second.prepared).toBe(0);
    expect(rosters).toHaveLength(first.prepared);
  });

  it("grava a capacidade só no culto informado", async () => {
    const removed: string[] = [];
    const created: unknown[] = [];
    const db = {
      rosterCapacityOverride: { findMany: async () => [], upsert: async () => ({}) },
      rosterSlot: { deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => { removed.push(...where.id.in); return { count: where.id.in.length }; }, create: async ({ data }: { data: unknown }) => { created.push(data); return data; } },
    };
    const roster = {
      id: "culto", status: "DRAFT", serviceType: "sunday_morning", serviceAt: new Date(),
      module: { name: "Apoio Interno", rules: {} },
      slots: [{ id: "extra", roleLabel: "Apoio Interno", requiresCouple: false, requiredQualification: null, sortOrder: 2, assignments: [] }],
    };
    const result = await applyCapacity(db as never, roster, [{ id: capacityGroupId("Apoio Interno", false), count: 1 }]);
    expect(result.rosterId).toBe("culto");
    expect(removed).toEqual([]);
    expect(created.length + roster.slots.length).toBeGreaterThanOrEqual(1);
  });

  it("une Recepção, Conexão e Santa Ceia sem perder a escala mais antiga", () => {
    const plan = planModuleConsolidation([
      { id: "b", ministryId: "atmosfera", name: "Recepcao", nameKey: "recepcao", rules: {}, rosterCount: 0 },
      { id: "a", ministryId: "atmosfera", name: "Recepção", nameKey: "recepção", rules: { volunteerIds: ["ana"] }, rosterCount: 2 },
      { id: "c", ministryId: "atmosfera", name: "Conexao", nameKey: "conexao", rules: {}, rosterCount: 1 },
      { id: "d", ministryId: "atmosfera", name: "Conexão", nameKey: "conexão", rules: { couples: [["c", "d"]] }, rosterCount: 0 },
      { id: "e", ministryId: "atmosfera", name: "Diaconia", nameKey: "diaconia", rules: {}, rosterCount: 1 },
      { id: "f", ministryId: "atmosfera", name: "Santa Ceia", nameKey: "santa ceia", rules: { communionStages: 2 }, rosterCount: 4 },
    ]);
    expect(plan.find(item => item.nameKey === "recepcao")).toMatchObject({ keepId: "a", name: "Recepção", dropIds: ["b"], rules: { volunteerIds: ["ana"] } });
    expect(plan.find(item => item.nameKey === "conexao")).toMatchObject({ keepId: "d", name: "Conexão", dropIds: ["c"] });
    expect(plan.find(item => item.nameKey === "ceia")).toMatchObject({ keepId: "f", name: "Santa Ceia", dropIds: ["e"], rules: { communionStages: 2 } });
    expect(standardPositions("Recepcao", "sunday_morning", {}).length).toBeGreaterThan(0);
    expect(standardPositions("Diaconia", "sunday_morning", { communionStages: 1 })).toHaveLength(1);
  });

  it("documenta a migração aditiva", () => {
    const sql = readFileSync(join(__dirname, "../../../../packages/db/prisma/migrations/20261118223000_roster_module_links/migration.sql"), "utf8");
    expect(sql).toContain("volunteerIds");
    expect(sql).toContain("ON CONFLICT (\"membership_id\", \"module_id\") DO NOTHING");
    expect(sql).toContain("membership.status = 'ATIVO'");
    expect(sql).not.toContain("DELETE FROM \"ministry_roster_module_memberships\"");
  });
});
