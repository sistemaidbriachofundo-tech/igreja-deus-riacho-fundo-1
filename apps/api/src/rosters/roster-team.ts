import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/types/auth-user";
import type { PrismaService } from "../prisma/prisma.service";
import { churchDayKey } from "./church-day";
import { evaluateCandidate } from "./preview-domain/eligibility";
import { utcWeeklyWindowsToRiachoLocal } from "./preview-domain/timezone-availability";
import { DEFAULT_RULES } from "./preview-domain/types";
import { assertDistinctRosterPartners, assertNoRosterDayConflict, writeRosterAssignment } from "./roster-assignment-transaction";
import { rosterInScope } from "./roster-module-policy";
import { loadRosterAccess, rulesWithTeam, volunteerIdsByModule } from "./roster-module-runtime";
import { assertOpenModuleSlot, assertSlotEligibility, isModuleVolunteer } from "./roster-operating-rules";

const PORTAL = "/app/servir/meu-espaco/";
type Pilot = { organizationId: string; churchId: string };
type Tx = Prisma.TransactionClient;
type Db = PrismaService;

export type MemberInvitationView = {
  id: string;
  personId: string;
  personName: string | null;
  moduleId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
};

function envelope(invitations: MemberInvitationView[]) {
  return { invitations };
}

async function ministryOf(db: Tx, ministryId: string, pilot: Pilot) {
  const ministry = await db.ministry.findFirst({
    where: { id: ministryId, churchId: pilot.churchId, organizationId: pilot.organizationId },
    select: { id: true, leaderPersonId: true },
  });
  if (!ministry) throw new NotFoundException("Ministério não encontrado.");
  return ministry;
}

async function assertModule(db: Tx, actor: AuthUser, ministry: { id: string; leaderPersonId: string | null }, moduleId: string, pilot: Pilot) {
  const access = await loadRosterAccess(db as never, actor, ministry, pilot);
  if (!rosterInScope(moduleId, access)) {
    throw new ForbiddenException({ code: "ROSTER_MODULE_FORBIDDEN", message: "Sem permissão neste módulo." });
  }
}

async function present(db: Tx, rows: Array<{ id: string; personId: string; moduleId: string; status: MemberInvitationView["status"] }>) {
  const people = rows.length ? await db.person.findMany({ where: { id: { in: rows.map(row => row.personId) } }, select: { id: true, displayName: true } }) : [];
  const names = new Map(people.map(person => [person.id, person.displayName]));
  return envelope(rows.map(row => ({ id: row.id, personId: row.personId, personName: names.get(row.personId) ?? null, moduleId: row.moduleId, status: row.status })));
}

const txOf = (db: Db) => db as unknown as Tx;

export async function listRosterMemberInvitations(db: Db, actor: AuthUser, pilot: Pilot, ministryId: string) {
  const ministry = await ministryOf(txOf(db), ministryId, pilot);
  const access = await loadRosterAccess(db as never, actor, ministry, pilot);
  const rows = await db.ministryRosterMemberInvitation.findMany({
    where: {
      ministryId, churchId: pilot.churchId,
      ...(access.scope === "modules" ? { moduleId: { in: access.moduleIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, personId: true, moduleId: true, status: true },
  });
  return present(txOf(db), rows);
}

export async function createRosterMemberInvitation(db: Db, actor: AuthUser, pilot: Pilot, ministryId: string, input: { personId: string; moduleId: string }) {
  const ministry = await ministryOf(txOf(db), ministryId, pilot);
  const module = await db.ministryRosterModule.findFirst({ where: { id: input.moduleId, ministryId }, select: { id: true, name: true } });
  if (!module) throw new NotFoundException("Módulo não encontrado neste ministério.");
  await assertModule(txOf(db), actor, ministry, module.id, pilot);
  const membership = await db.ministryMembership.findFirst({
    where: { ministryId, personId: input.personId, churchId: pilot.churchId, status: "ATIVO", endedAt: null, person: { status: "ACTIVE" } },
    select: { id: true, personId: true },
  });
  if (!membership) throw new ConflictException({ code: "ROSTER_MEMBERSHIP_REQUIRED", message: "Somente integrante ativo do ministério pode ser convidado ao módulo." });
  const linked = await txOf(db).ministryRosterModuleMembership.findFirst({
    where: { moduleId: module.id, personId: input.personId, status: "ATIVO", endedAt: null },
    select: { id: true },
  });
  if (linked) throw new ConflictException({ code: "ROSTER_MODULE_ALREADY_LINKED", message: "Esta pessoa já está na equipe do módulo." });
  return db.$transaction(async tx => {
    const pending = await tx.ministryRosterMemberInvitation.findFirst({
      where: { moduleId: module.id, personId: input.personId, status: "PENDING" },
      select: { id: true, personId: true, moduleId: true, status: true },
    });
    const invitation = pending ?? await tx.ministryRosterMemberInvitation.create({
      data: {
        organizationId: pilot.organizationId, churchId: pilot.churchId, ministryId, moduleId: module.id,
        membershipId: membership.id, personId: input.personId, status: "PENDING",
      },
      select: { id: true, personId: true, moduleId: true, status: true },
    });
    await tx.rosterNotice.createMany({
      data: [{
        id: `module-invite:${invitation.id}`, churchId: pilot.churchId, personId: input.personId, kind: "module-invite",
        title: "Convite para a equipe", body: `Você foi convidado para ${module.name}.`, path: `${PORTAL}#convite-equipe-${invitation.id}`,
      }],
      skipDuplicates: true,
    });
    return (await present(tx, [invitation])).invitations[0];
  });
}

export async function listMyRosterMemberInvitations(db: Db, actor: AuthUser, pilot: Pilot) {
  if (!actor.personId) throw new ForbiddenException("A sessão precisa estar vinculada a uma pessoa.");
  const rows = await db.ministryRosterMemberInvitation.findMany({
    where: { personId: actor.personId, churchId: pilot.churchId },
    orderBy: { createdAt: "desc" },
    select: { id: true, personId: true, moduleId: true, status: true },
  });
  return present(txOf(db), rows);
}

export async function respondRosterMemberInvitation(db: Db, actor: AuthUser, pilot: Pilot, invitationId: string, status: "ACCEPTED" | "DECLINED", now = new Date()) {
  if (!actor.personId) throw new ForbiddenException("A sessão precisa estar vinculada a uma pessoa.");
  return db.$transaction(async tx => {
    const invitation = await tx.ministryRosterMemberInvitation.findFirst({
      where: { id: invitationId, churchId: pilot.churchId },
      select: { id: true, personId: true, moduleId: true, membershipId: true, ministryId: true, status: true, organizationId: true },
    });
    if (!invitation || invitation.personId !== actor.personId) throw new NotFoundException("Convite não encontrado.");
    if (invitation.status === status) {
      return (await present(tx, [invitation])).invitations[0];
    }
    if (invitation.status !== "PENDING") throw new ConflictException({ code: "ROSTER_INVITATION_CLOSED", message: "Este convite já foi respondido." });
    if (status === "ACCEPTED") {
      await tx.ministryRosterModuleMembership.upsert({
        where: { membershipId_moduleId: { membershipId: invitation.membershipId, moduleId: invitation.moduleId } },
        create: {
          organizationId: invitation.organizationId, churchId: pilot.churchId, ministryId: invitation.ministryId,
          membershipId: invitation.membershipId, moduleId: invitation.moduleId, personId: invitation.personId, status: "ATIVO", startedAt: now,
        },
        update: { status: "ATIVO", endedAt: null, startedAt: now },
      });
    }
    const saved = await tx.ministryRosterMemberInvitation.update({
      where: { id: invitation.id },
      data: { status, respondedAt: now },
      select: { id: true, personId: true, moduleId: true, status: true },
    });
    return (await present(tx, [saved])).invitations[0];
  });
}

type SlotRow = {
  id: string;
  roleLabel: string;
  requiresCouple: boolean;
  requiredQualification: string | null;
  assignments: Array<{ id: string; personId: string; partnerPersonId: string | null; status: string }>;
  roster: {
    id: string;
    title: string;
    status: string;
    serviceAt: Date;
    ministryId: string | null;
    moduleId: string | null;
    organizationId: string;
    churchId: string;
    ministry: { id: string; leaderPersonId: string | null } | null;
    module: { id: string; name: string; rules: unknown } | null;
  };
};

function isPublicVacancy(slot: SlotRow, now: Date) {
  return slot.roster.status === "PUBLISHED" && slot.roster.serviceAt > now &&
    !slot.assignments.some(item => item.status === "PENDING" || item.status === "CONFIRMED");
}

async function loadSlot(db: Tx, slotId: string, pilot: Pilot): Promise<SlotRow> {
  const slot = await db.rosterSlot.findFirst({
    where: { id: slotId, roster: { churchId: pilot.churchId, organizationId: pilot.organizationId } },
    include: {
      assignments: { select: { id: true, personId: true, partnerPersonId: true, status: true } },
      roster: { include: { ministry: { select: { id: true, leaderPersonId: true } }, module: true } },
    },
  });
  if (!slot) throw new NotFoundException("Vaga não encontrada.");
  return slot as unknown as SlotRow;
}

export async function eligibleSlotCandidates(db: Tx, slot: SlotRow, now = new Date()) {
  const roster = slot.roster;
  if (!roster.ministryId || !roster.moduleId || !isPublicVacancy(slot, now)) return [];
  const teams = await volunteerIdsByModule(db as never, [roster.moduleId]);
  const rules = rulesWithTeam(roster.module?.rules, roster.moduleId, teams);
  const members = await db.ministryMembership.findMany({
    where: { ministryId: roster.ministryId, churchId: roster.churchId, status: "ATIVO", endedAt: null, person: { status: "ACTIVE" } },
    select: { personId: true, person: { select: { displayName: true } } },
    orderBy: { personId: "asc" },
  });
  const ids = members.filter(member => isModuleVolunteer(rules, member.personId)).map(member => member.personId);
  if (!ids.length) return [];
  const month = churchDayKey(roster.serviceAt).slice(0, 7);
  const [responses, windows, impediments, assignments, people] = await Promise.all([
    db.rosterAvailabilityResponse.findMany({ where: { churchId: roster.churchId, month, personId: { in: ids } }, select: { personId: true, rosterIds: true } }),
    db.volunteerAvailability.findMany({ where: { churchId: roster.churchId, organizationId: roster.organizationId, personId: { in: ids }, active: true } }),
    db.volunteerImpediment.findMany({ where: { churchId: roster.churchId, organizationId: roster.organizationId, personId: { in: ids }, startsAt: { lte: roster.serviceAt }, endsAt: { gt: roster.serviceAt } } }),
    db.rosterAssignment.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, OR: [{ personId: { in: ids } }, { partnerPersonId: { in: ids } }] },
      include: { slot: { include: { roster: true } } },
    }),
    db.person.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
  ]);
  const names = new Map(people.map(person => [person.id, person.displayName]));
  const answered = new Map(responses.map(row => [row.personId, row.rosterIds]));
  const available = ids.filter(personId => {
    const answer = answered.get(personId);
    return answer ? answer.includes(roster.id) : windows.some(window => window.personId === personId);
  });
  const partners = new Map(rules.couples.flatMap(([left, right]) => [[left, right], [right, left]] as const));
  const candidates = available.map(personId => ({
    personId, active: true, churchIds: [roster.churchId], ministryIds: [roster.ministryId!], qualifiedPositionIds: [slot.id],
    spousePersonId: partners.get(personId) ?? null, serveAsCouple: false,
    approvedRoleTags: Object.keys(rules.qualifications).filter(tag => rules.qualifications[tag].includes(personId)),
    availability: utcWeeklyWindowsToRiachoLocal(windows.filter(window => window.personId === personId)),
    impediments: impediments.filter(item => item.personId === personId).map(item => ({ startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString() })),
  }));
  const history = assignments.map(item => ({
    ...item, assignmentId: item.id, positionId: item.slotId, rosterId: item.slot.rosterId,
    churchId: roster.churchId, ministryId: item.slot.roster.ministryId ?? "", serviceAt: item.slot.roster.serviceAt.toISOString(),
  }));
  const demand = {
    slotId: slot.id, positionId: slot.id, rosterId: roster.id, roleLabel: slot.roleLabel,
    churchId: roster.churchId, ministryId: roster.ministryId, serviceAt: roster.serviceAt.toISOString(), serviceType: "special_event" as const,
    requiresCouple: slot.requiresCouple, requiredRoleTags: slot.requiredQualification ? [slot.requiredQualification] : [],
  };
  const ruleset = { ...DEFAULT_RULES, minIntervalDays: rules.minIntervalDays, maxMonthlyAssignments: rules.maxMonthlyAssignments, enforceCouples: slot.requiresCouple };
  return candidates.flatMap(candidate => {
    if (slot.requiresCouple && (!candidate.spousePersonId || !available.includes(candidate.spousePersonId))) return [];
    const decision = evaluateCandidate(candidate, demand, candidates, history, ruleset);
    if (!decision.eligible) return [];
    const partnerPersonId = slot.requiresCouple ? candidate.spousePersonId : null;
    if (slot.requiresCouple && partnerPersonId && partnerPersonId < candidate.personId) return [];
    return [{ personId: candidate.personId, personName: names.get(candidate.personId) ?? candidate.personId, ...(partnerPersonId ? { partnerPersonId, partnerName: names.get(partnerPersonId) ?? partnerPersonId } : {}) }];
  });
}

export async function listSlotCandidates(db: Db, actor: AuthUser, pilot: Pilot, slotId: string, now = new Date()) {
  const slot = await loadSlot(txOf(db), slotId, pilot);
  if (slot.roster.ministry && slot.roster.moduleId) await assertModule(txOf(db), actor, slot.roster.ministry, slot.roster.moduleId, pilot);
  return { candidates: await eligibleSlotCandidates(txOf(db), slot, now) };
}

export async function inviteSlotCandidate(db: Db, actor: AuthUser, pilot: Pilot, slotId: string, input: { personId: string; partnerPersonId?: string | null }, now = new Date()) {
  const slot = await loadSlot(txOf(db), slotId, pilot);
  if (!slot.roster.ministry || !slot.roster.moduleId) throw new ConflictException({ code: "ROSTER_SLOT_NOT_PUBLIC", message: "A cobertura vale para uma vaga publicada de um módulo." });
  await assertModule(txOf(db), actor, slot.roster.ministry, slot.roster.moduleId, pilot);
  const active = slot.assignments.filter(item => item.status === "PENDING" || item.status === "CONFIRMED");
  const same = active.find(item => item.personId === input.personId && (item.partnerPersonId ?? null) === (input.partnerPersonId ?? null));
  if (same) return { assignmentId: same.id, personId: same.personId, partnerPersonId: same.partnerPersonId ?? null, status: same.status };
  if (slot.roster.status !== "PUBLISHED" || slot.roster.serviceAt <= now) {
    throw new ConflictException({ code: "ROSTER_SLOT_NOT_PUBLIC", message: "A cobertura vale para uma vaga publicada." });
  }
  if (active.length) throw new ConflictException({ code: "ROSTER_SLOT_FILLED", message: "Esta vaga já foi preenchida." });
  const partnerPersonId = input.partnerPersonId ?? null;
  assertDistinctRosterPartners(input.personId, partnerPersonId);
  const candidates = await eligibleSlotCandidates(txOf(db), slot, now);
  const match = candidates.find(item => item.personId === input.personId && (item.partnerPersonId ?? null) === partnerPersonId);
  if (!match) throw new ConflictException({ code: "ROSTER_NOT_ELIGIBLE", message: "A pessoa não pode cobrir esta vaga.", reasonCodes: ["NOT_ELIGIBLE"] });
  const created = await writeRosterAssignment(db as never, async tx => {
    const current = await loadSlot(tx, slotId, pilot);
    const active = current.assignments.filter(item => item.status === "PENDING" || item.status === "CONFIRMED");
    const same = active.find(item => item.personId === input.personId && (item.partnerPersonId ?? null) === partnerPersonId);
    if (same) return same;
    if (active.length) throw new ConflictException({ code: "ROSTER_SLOT_FILLED", message: "Esta vaga já foi preenchida." });
    await assertOpenModuleSlot(tx, current);
    await assertSlotEligibility(tx, current, [input.personId, partnerPersonId].filter((id): id is string => Boolean(id)));
    await assertNoRosterDayConflict(tx, { churchId: pilot.churchId, serviceAt: current.roster.serviceAt, personIds: [input.personId, partnerPersonId].filter((id): id is string => Boolean(id)), conflictCode: "ROSTER_SAME_DAY" });
    const assignment = await tx.rosterAssignment.create({ data: { slotId, personId: input.personId, partnerPersonId, status: "PENDING" } });
    await tx.rosterNotice.createMany({
      data: [{
        id: `cover:${slotId}:${input.personId}`, churchId: pilot.churchId, personId: input.personId, kind: "cover",
        title: "Convite para cobrir uma vaga", body: `${current.roster.title}. Responda pelo portal.`, path: PORTAL,
      }],
      skipDuplicates: true,
    });
    return assignment;
  });
  return { assignmentId: created.id, personId: created.personId, partnerPersonId: created.partnerPersonId ?? null, status: created.status };
}
