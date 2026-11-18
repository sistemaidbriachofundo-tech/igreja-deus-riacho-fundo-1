import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { canAccessFinance, canAdministerMinistries } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { previewSlots } from "./preview-domain/scheduler";
import { DEFAULT_RULES, type Candidate, type ExistingAssignment } from "./preview-domain/types";
import {
  aggregateResponses,
  buildCapacityGroups,
  capacityGroupId,
  cultsInMonth,
  effectiveInviteLimit,
  explicitModuleLinks,
  monthsReadyToFill,
  moduleLeaderBlockedFromFinance,
  openVacancyText,
  planCapacityChange,
  publicPermissions,
  whatsappDevApproved,
  resolveRosterAccess,
  rosterInScope,
  standardPositions,
  surveyMonth,
  type ResponseStatus,
  type RosterAccess,
} from "./roster-module-policy";
import { readModuleRules, type CultType, type PositionRule } from "./roster-operating-rules";

type Db = Record<string, unknown> & {
  ministryRosterModuleLeader?: { findMany: (args: unknown) => Promise<Array<{ moduleId: string; personId?: string; ministryId?: string }>> };
  ministryRosterModuleMembership?: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    create?: (args: unknown) => Promise<unknown>;
    update?: (args: unknown) => Promise<unknown>;
    updateMany?: (args: unknown) => Promise<{ count: number }>;
    upsert?: (args: unknown) => Promise<unknown>;
  };
  ministryRosterModule?: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
  rosterAssignmentResponse?: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<{ personId: string; status: string; createdAt: Date; assignmentId?: string }>>;
  };
  rosterCapacityOverride?: {
    findMany: (args: unknown) => Promise<Array<{ rosterId?: string; groupKey: string; count: number }>>;
    upsert?: (args: unknown) => Promise<unknown>;
  };
  rosterNoticeDelivery?: { createMany: (args: unknown) => Promise<{ count: number }> };
  roster?: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    create?: (args: unknown) => Promise<{ id: string }>;
  };
  rosterSlot?: { create?: (args: unknown) => Promise<unknown>; deleteMany?: (args: unknown) => Promise<unknown> };
  rosterAssignment?: { create?: (args: unknown) => Promise<unknown>; findMany?: (args: unknown) => Promise<unknown[]> };
  ministry?: { findMany: (args: unknown) => Promise<Array<{ id: string; leaderPersonId: string | null }>> };
  ministryMembership?: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
  person?: { findMany?: (args: unknown) => Promise<Array<{ id: string }>> };
};

const ACTIVE = ["PENDING", "CONFIRMED"] as const;

export async function loadRosterAccess(
  db: Db,
  actor: AuthUser,
  ministry: { id: string; leaderPersonId: string | null },
  pilot: { organizationId: string; churchId: string },
): Promise<RosterAccess> {
  const churchWide = canAdministerMinistries(actor.grants, pilot);
  const ministryLeader = Boolean(actor.personId && ministry.leaderPersonId === actor.personId);
  const led = db.ministryRosterModuleLeader?.findMany && actor.personId
    ? await db.ministryRosterModuleLeader.findMany({
      where: { personId: actor.personId, ministryId: ministry.id, churchId: pilot.churchId, organizationId: pilot.organizationId },
      select: { moduleId: true },
    })
    : [];
  return resolveRosterAccess({ churchWide, ministryLeader, ledModuleIds: led.map(row => row.moduleId) });
}

export async function assertRosterModuleAllowed(
  db: Db,
  actor: AuthUser,
  ministry: { id: string; leaderPersonId: string | null } | null,
  moduleId: string | null | undefined,
  pilot: { organizationId: string; churchId: string },
): Promise<void> {
  if (!ministry || !db.ministryRosterModuleLeader?.findMany) return;
  const access = await loadRosterAccess(db, actor, ministry, pilot);
  if (!rosterInScope(moduleId, access)) {
    throw new ForbiddenException({ code: "ROSTER_MODULE_FORBIDDEN", message: "Sem permissão neste módulo." });
  }
}

export async function assertModuleLeaderCash(
  db: Db,
  actor: AuthUser,
  pilot: { organizationId: string; churchId: string },
): Promise<void> {
  if (!db.ministryRosterModuleLeader?.findMany || !actor.personId) return;
  if (canAccessFinance(actor.grants, pilot) || canAdministerMinistries(actor.grants, pilot)) return;
  const links = await db.ministryRosterModuleLeader.findMany({
    where: { personId: actor.personId, churchId: pilot.churchId, organizationId: pilot.organizationId },
    select: { ministryId: true },
  });
  if (!links.length) return;
  const ministries = db.ministry?.findMany
    ? await db.ministry.findMany({
      where: { id: { in: [...new Set(links.map(link => link.ministryId))] } },
      select: { id: true, leaderPersonId: true },
    })
    : [];
  const blocked = links.some(link => ministries.find(item => item.id === link.ministryId)?.leaderPersonId !== actor.personId);
  if (blocked) {
    throw new ForbiddenException({ code: "FINANCE_PERMISSION_REQUIRED", message: "A caixa exige permissão financeira própria." });
  }
}

export async function assertModuleFinance(
  db: Db,
  actor: AuthUser,
  ministry: { id: string; leaderPersonId: string | null },
  pilot: { organizationId: string; churchId: string },
): Promise<void> {
  if (!db.ministryRosterModuleLeader?.findMany) return;
  const access = await loadRosterAccess(db, actor, ministry, pilot);
  if (moduleLeaderBlockedFromFinance(access, canAccessFinance(actor.grants, pilot))) {
    throw new ForbiddenException({
      code: "FINANCE_PERMISSION_REQUIRED",
      message: "A caixa exige permissão financeira própria.",
    });
  }
}

export async function volunteerIdsByModule(db: Db, moduleIds: readonly string[], now = new Date()): Promise<Map<string, string[]> | null> {
  if (!db.ministryRosterModuleMembership?.findMany || !moduleIds.length) return db.ministryRosterModuleMembership?.findMany ? new Map() : null;
  const rows = await db.ministryRosterModuleMembership.findMany({
    where: {
      moduleId: { in: [...moduleIds] }, status: "ATIVO", endedAt: null, startedAt: { lte: now },
      person: { status: "ACTIVE" }, membership: { status: "ATIVO", endedAt: null },
    },
    select: { moduleId: true, personId: true },
  });
  const map = new Map<string, string[]>();
  for (const id of moduleIds) map.set(id, []);
  for (const row of rows) {
    const moduleId = String(row.moduleId);
    const list = map.get(moduleId) ?? [];
    if (!list.includes(String(row.personId))) list.push(String(row.personId));
    map.set(moduleId, list);
  }
  return map;
}

export function rulesWithTeam(raw: unknown, moduleId: string | null | undefined, teams: Map<string, string[]> | null) {
  const rules = readModuleRules(raw);
  if (!moduleId || !teams) return rules;
  return { ...rules, volunteerIds: [...new Set(teams.get(moduleId) ?? [])] };
}

export async function patchMembershipModules(
  db: Db,
  actor: AuthUser,
  pilot: { organizationId: string; churchId: string },
  ministry: { id: string; leaderPersonId: string | null },
  membershipId: string,
  input: { addModuleIds: string[]; removeModuleIds: string[] },
  now = new Date(),
) {
  const access = await loadRosterAccess(db, actor, ministry, pilot);
  if (!access.manageModuleMemberships) {
    throw new ForbiddenException({ code: "ROSTER_MODULE_FORBIDDEN", message: "Sem permissão para alterar a equipe do módulo." });
  }
  const add = [...new Set(input.addModuleIds.map(id => id.trim()).filter(Boolean))];
  const remove = [...new Set(input.removeModuleIds.map(id => id.trim()).filter(Boolean))];
  if (add.some(id => remove.includes(id))) throw new BadRequestException("Não inclua o mesmo módulo nos dois lados.");
  const membership = await first(db, "ministryMembership", {
    where: { id: membershipId, ministryId: ministry.id },
    include: { person: { select: { status: true } } },
  }) as { id: string; churchId: string; organizationId: string; status: string; endedAt: Date | null; personId: string; person?: { status: string } } | null;
  if (!membership || membership.churchId !== pilot.churchId || membership.organizationId !== pilot.organizationId) {
    throw new NotFoundException("Integrante não encontrado nesta congregação.");
  }
  if (membership.status !== "ATIVO" || membership.endedAt || membership.person?.status !== "ACTIVE") {
    throw new ConflictException("Somente integrante ativo entra na equipe do módulo.");
  }
  const modules = db.ministryRosterModule ? await db.ministryRosterModule.findMany({
    where: { ministryId: ministry.id, id: { in: [...add, ...remove] } }, select: { id: true, rules: true },
  }) : [];
  const known = new Set(modules.map(module => String(module.id)));
  const requested = [...add, ...remove];
  if (requested.some(id => !known.has(id))) throw new NotFoundException("Módulo não encontrado neste ministério.");
  if (access.scope === "modules" && requested.some(id => !access.moduleIds.includes(id))) {
    throw new ForbiddenException({ code: "ROSTER_MODULE_FORBIDDEN", message: "Só é possível alterar módulos autorizados." });
  }
  for (const moduleId of remove) {
    const rules = readModuleRules(modules.find(module => module.id === moduleId)?.rules);
    const referenced = [...Object.values(rules.qualifications).flat(), ...rules.couples.flat()];
    if (referenced.includes(membership.personId)) {
      throw new ConflictException("Retire a pessoa do casal ou da habilitação antes de encerrar o vínculo do módulo.");
    }
  }
  const table = db.ministryRosterModuleMembership;
  if (!table?.upsert || !table.updateMany) throw new ConflictException("O vínculo de módulo ainda não está disponível.");
  for (const moduleId of add) {
    await table.upsert({
      where: { membershipId_moduleId: { membershipId, moduleId } },
      create: {
        organizationId: pilot.organizationId, churchId: pilot.churchId, ministryId: ministry.id,
        membershipId, moduleId, personId: membership.personId, status: "ATIVO", startedAt: now,
      },
      update: { status: "ATIVO", endedAt: null, startedAt: now },
    });
  }
  if (remove.length) {
    await table.updateMany({
      where: { membershipId, moduleId: { in: remove }, status: "ATIVO" },
      data: { status: "ENCERRADO", endedAt: now },
    });
  }
  const active = await table.findMany({
    where: { membershipId, status: "ATIVO", endedAt: null }, select: { moduleId: true },
  });
  return { membershipId, moduleIds: active.map(row => String(row.moduleId)) };
}

export async function syncExplicitLinks(db: Db, module: { id: string; ministryId: string; rules: unknown }, pilot: { organizationId: string; churchId: string }, now = new Date()) {
  const table = db.ministryRosterModuleMembership;
  const memberships = db.ministryMembership;
  if (!table?.upsert || !table.updateMany || !memberships?.findMany) return;
  const source = module.rules;
  if (!source || typeof source !== "object" || Array.isArray(source) || !Object.prototype.hasOwnProperty.call(source, "volunteerIds")) return;
  const rows = await memberships.findMany({
    where: { ministryId: module.ministryId, churchId: pilot.churchId, status: "ATIVO", endedAt: null, person: { status: "ACTIVE" } },
  });
  const activePeople = new Set(rows.map(row => String(row.personId)));
  const seeds = explicitModuleLinks([module], rows.map(row => ({
    id: String(row.id), ministryId: String(row.ministryId), personId: String(row.personId), status: String(row.status),
    endedAt: (row.endedAt as Date | null) ?? null, churchId: String(row.churchId), organizationId: String(row.organizationId),
  })), activePeople);
  const wanted = new Set(seeds.map(seed => seed.personId));
  const current = await table.findMany({ where: { moduleId: module.id, status: "ATIVO", endedAt: null }, select: { personId: true } });
  const stale = current.map(row => String(row.personId)).filter(personId => !wanted.has(personId));
  if (stale.length) await table.updateMany({ where: { moduleId: module.id, personId: { in: stale }, status: "ATIVO" }, data: { status: "ENCERRADO", endedAt: now } });
  for (const seed of seeds) {
    await table.upsert({
      where: { membershipId_moduleId: { membershipId: seed.membershipId, moduleId: seed.moduleId } },
      create: { ...seed, status: "ATIVO", startedAt: now },
      update: { status: "ATIVO", endedAt: null },
    });
  }
}

export async function capacityView(db: Db, roster: {
  id: string; status: string; moduleId?: string | null; serviceType?: string | null; serviceAt: Date;
  module?: { name?: string | null; rules?: unknown } | null;
  slots: Array<{ id: string; roleLabel: string; requiresCouple: boolean; requiredQualification?: string | null; assignments?: Array<{ status: string }> }>;
}, enabled: boolean) {
  if (!enabled || roster.status !== "DRAFT") return undefined;
  const rules = readModuleRules(roster.module?.rules);
  const cult = (roster.serviceType ?? "special_event") as CultType;
  const configured = rules.positions[cult] ?? [];
  const positions = configured.length ? configured : standardPositions(roster.module?.name, cult, roster.module?.rules);
  const overrides = new Map<string, number>();
  if (db.rosterCapacityOverride?.findMany) {
    const rows = await db.rosterCapacityOverride.findMany({ where: { rosterId: roster.id }, select: { groupKey: true, count: true } });
    for (const row of rows) overrides.set(row.groupKey, row.count);
  }
  return buildCapacityGroups({
    positions, overrides,
    slots: roster.slots.map(slot => ({
      ...slot, active: (slot.assignments ?? []).some(item => ACTIVE.includes(item.status as typeof ACTIVE[number])),
    })),
  });
}

export async function applyCapacity(
  db: Db,
  roster: {
    id: string; status: string; module?: { name?: string | null; rules?: unknown } | null; serviceType?: string | null;
    slots: Array<{ id: string; roleLabel: string; requiresCouple: boolean; requiredQualification?: string | null; sortOrder: number; sector?: string | null; zone?: string | null; side?: string | null; assignments?: Array<{ status: string }> }>;
  },
  requested: { id: string; count: number }[],
) {
  if (roster.status !== "DRAFT") throw new ConflictException("A quantidade só muda no rascunho deste culto.");
  const groups = await capacityView(db, { ...roster, serviceAt: new Date() }, true);
  if (!groups) throw new ConflictException("O ajuste de quantidade não está disponível.");
  let plan: ReturnType<typeof planCapacityChange>;
  try {
    plan = planCapacityChange({
      groups, requested,
      slots: roster.slots.map(slot => ({
        id: slot.id,
        groupId: capacityGroupId(slot.roleLabel, slot.requiresCouple, slot.requiredQualification),
        active: (slot.assignments ?? []).some(item => ACTIVE.includes(item.status as typeof ACTIVE[number])),
        sortOrder: slot.sortOrder,
      })),
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "CAPACITY_LIMIT";
    throw new BadRequestException({ code, message: error instanceof Error ? error.message : "Quantidade inválida." });
  }
  if (plan.removeIds.length && db.rosterSlot?.deleteMany) {
    await db.rosterSlot.deleteMany({ where: { id: { in: plan.removeIds }, rosterId: roster.id, assignments: { none: { status: { in: [...ACTIVE] } } } } });
  }
  const rules = readModuleRules(roster.module?.rules);
  const cult = (roster.serviceType ?? "special_event") as CultType;
  const positions = (rules.positions[cult]?.length ? rules.positions[cult] : standardPositions(roster.module?.name, cult, roster.module?.rules)) ?? [];
  const byId = new Map(positions.map(position => [capacityGroupId(position.label, position.couple, position.qualification), position]));
  let sort = roster.slots.reduce((max, slot) => Math.max(max, slot.sortOrder), 0);
  for (const item of plan.create) {
    const position = byId.get(item.groupId) ?? groupFromSlots(roster.slots, item.groupId);
    if (!position || !db.rosterSlot?.create) continue;
    for (let index = 0; index < item.count; index += 1) {
      sort += 1;
      await db.rosterSlot.create({ data: {
        rosterId: roster.id, roleLabel: position.label, requiresCouple: position.couple,
        requiredQualification: position.qualification ?? null, sector: position.sector ?? null, zone: position.zone ?? null,
        side: position.side ?? null, sortOrder: sort,
      } });
    }
  }
  if (db.rosterCapacityOverride?.upsert) {
    for (const item of requested) {
      await db.rosterCapacityOverride.upsert({
        where: { rosterId_groupKey: { rosterId: roster.id, groupKey: item.id } },
        create: { rosterId: roster.id, groupKey: item.id, count: item.count },
        update: { count: item.count },
      });
    }
  }
  return { rosterId: roster.id, removed: plan.removeIds.length, created: plan.create.reduce((sum, item) => sum + item.count, 0) };
}

function groupFromSlots(slots: Array<{ roleLabel: string; requiresCouple: boolean; requiredQualification?: string | null; sector?: string | null; zone?: string | null; side?: string | null }>, groupId: string): PositionRule | null {
  const slot = slots.find(item => capacityGroupId(item.roleLabel, item.requiresCouple, item.requiredQualification) === groupId);
  if (!slot) return null;
  return {
    label: slot.roleLabel, count: 1, couple: slot.requiresCouple,
    ...(slot.requiredQualification ? { qualification: slot.requiredQualification } : {}),
    sector: slot.sector, zone: slot.zone, side: slot.side,
  };
}

export async function appendParticipantResponse(
  db: Db,
  assignment: { id: string; personId: string; partnerPersonId: string | null },
  actorPersonId: string | null | undefined,
  status: ResponseStatus,
  now: Date,
): Promise<ResponseStatus | null> {
  const people = [assignment.personId, assignment.partnerPersonId].filter((id): id is string => Boolean(id));
  if (!actorPersonId || !people.includes(actorPersonId) || !db.rosterAssignmentResponse?.create) return null;
  await db.rosterAssignmentResponse.create({ data: { assignmentId: assignment.id, personId: actorPersonId, status, createdAt: now } });
  if (people.length < 2) return null;
  const history = await db.rosterAssignmentResponse.findMany({ where: { assignmentId: assignment.id }, orderBy: { createdAt: "asc" } });
  const latest = new Map<string, ResponseStatus>();
  for (const row of history) {
    if (row.status === "PENDING" || row.status === "CONFIRMED" || row.status === "DECLINED") latest.set(row.personId, row.status);
  }
  return aggregateResponses(people, latest);
}

export async function responseHistory(db: Db, assignmentIds: readonly string[]) {
  if (!db.rosterAssignmentResponse?.findMany || !assignmentIds.length) return new Map<string, Array<{ personId: string; status: string; createdAt: Date }>>();
  const rows = await db.rosterAssignmentResponse.findMany({ where: { assignmentId: { in: [...assignmentIds] } }, orderBy: { createdAt: "asc" } });
  const map = new Map<string, Array<{ personId: string; status: string; createdAt: Date }>>();
  for (const row of rows) {
    const id = row.assignmentId ?? "";
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

export async function linkedMembershipIds(db: Db, moduleIds: readonly string[]): Promise<Set<string> | null> {
  if (!db.ministryRosterModuleMembership?.findMany) return null;
  if (!moduleIds.length) return new Set();
  const rows = await db.ministryRosterModuleMembership.findMany({
    where: { moduleId: { in: [...moduleIds] }, status: "ATIVO", endedAt: null }, select: { membershipId: true },
  });
  return new Set(rows.map(row => String(row.membershipId)));
}

export function positionsForModule(name: string | null | undefined, cult: CultType, raw: unknown): PositionRule[] {
  const rules = readModuleRules(raw);
  const configured = rules.positions[cult] ?? [];
  return configured.length ? configured : standardPositions(name, cult, raw);
}

export async function maintainRosterCycle(db: Db, pilot: { organizationId: string; churchId: string }, now = new Date()) {
  if (!db.ministryRosterModule?.findMany || !db.roster?.findMany || !db.roster.create) return { prepared: 0, generated: 0 };
  const modules = await db.ministryRosterModule.findMany({
    where: { ministry: { organizationId: pilot.organizationId, churchId: pilot.churchId } },
    select: { id: true, name: true, rules: true, ministryId: true },
  });
  const months = [...new Set([surveyMonth(now), ...monthsReadyToFill(now)])];
  const existing = await db.roster.findMany({
    where: { organizationId: pilot.organizationId, churchId: pilot.churchId, moduleId: { not: null } },
    select: {
      id: true, moduleId: true, serviceAt: true, status: true, serviceType: true,
      slots: { select: { id: true, roleLabel: true, requiresCouple: true, requiredQualification: true, assignments: { where: { status: { in: [...ACTIVE] } }, select: { id: true } } } },
    },
  });
  let prepared = 0;
  for (const month of months) {
    for (const cult of cultsInMonth(month)) {
      for (const module of modules) {
        const positions = positionsForModule(String(module.name ?? ""), cult.serviceType, module.rules);
        if (!positions.length) continue;
        const found = existing.find(row => row.moduleId === module.id && +new Date(String(row.serviceAt)) === +cult.serviceAt);
        if (found) continue;
        const slots = positions.flatMap((position, group) => Array.from({ length: position.count }, (_, index) => ({
          id: `${module.id}:${cult.serviceAt.toISOString()}:${group}:${index}`,
          roleLabel: position.label, requiresCouple: position.couple, requiredQualification: position.qualification ?? null, assignments: [],
        })));
        const created = await db.roster.create({ data: {
          organizationId: pilot.organizationId, churchId: pilot.churchId, ministryId: module.ministryId, moduleId: module.id,
          title: `${module.name} · ${cult.serviceType}`, serviceAt: cult.serviceAt, serviceType: cult.serviceType, status: "DRAFT",
          slots: { create: slots.map((slot, sortOrder) => ({
            roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple, requiredQualification: slot.requiredQualification, sortOrder,
          })) },
        } });
        existing.push({ id: created.id, moduleId: module.id, serviceAt: cult.serviceAt, status: "DRAFT", serviceType: cult.serviceType, slots: [] });
        prepared += 1;
      }
    }
  }
  const generated = await fillClosedDrafts(db, pilot, modules, existing, now);
  return { prepared, generated };
}

async function fillClosedDrafts(
  db: Db,
  pilot: { organizationId: string; churchId: string },
  modules: Array<Record<string, unknown>>,
  rosters: Array<Record<string, unknown>>,
  now: Date,
) {
  if (!db.rosterAssignment?.create) return 0;
  const teams = await volunteerIdsByModule(db, modules.map(module => String(module.id)), now);
  if (!teams) return 0;
  const ready = new Set(monthsReadyToFill(now));
  const history: ExistingAssignment[] = [];
  let created = 0;
  for (const roster of rosters) {
    if (roster.status !== "DRAFT") continue;
    const serviceAt = new Date(String(roster.serviceAt));
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(serviceAt);
    if (!ready.has(month)) continue;
    const module = modules.find(item => item.id === roster.moduleId);
    if (isManualCommunion(module?.name, module?.rules)) continue;
    const rules = rulesWithTeam(module?.rules, String(roster.moduleId ?? ""), teams);
    const open = Array.isArray(roster.slots) ? roster.slots as Array<Record<string, unknown>> : [];
    const empty = open.filter(slot => !Array.isArray(slot.assignments) || !(slot.assignments as unknown[]).length);
    if (!empty.length) continue;
    const members = rules.volunteerIds ?? [];
    if (!members.length) {
      for (const slot of empty) slot.openReason = openVacancyText(["EMPTY_TEAM"]);
      continue;
    }
    const candidates: Candidate[] = members.map(personId => ({
      personId, active: true, churchIds: [pilot.churchId], ministryIds: [String(module?.ministryId ?? "")],
      qualifiedPositionIds: empty.map(slot => String(slot.id)),
      approvedRoleTags: Object.keys(rules.qualifications).filter(tag => rules.qualifications[tag].includes(personId)),
      spousePersonId: rules.couples.find(pair => pair.includes(personId))?.find(id => id !== personId) ?? null,
      availability: [],
    }));
    const plan = previewSlots(empty.map(slot => ({
      slotId: String(slot.id), rosterId: String(roster.id), churchId: pilot.churchId, ministryId: String(module?.ministryId ?? ""),
      positionId: String(slot.roleLabel), roleLabel: String(slot.roleLabel), requiresCouple: Boolean(slot.requiresCouple),
      requiredRoleTags: slot.requiredQualification ? [String(slot.requiredQualification)] : [],
      serviceAt: serviceAt.toISOString(), serviceType: String(roster.serviceType ?? "special_event") as CultType,
    })), candidates, history, { ...DEFAULT_RULES, minIntervalDays: rules.minIntervalDays, maxMonthlyAssignments: rules.maxMonthlyAssignments, requireExplicitAvailability: false });
    for (const draft of plan.drafts) {
      await db.rosterAssignment.create({ data: { slotId: draft.slotId, personId: draft.personId, partnerPersonId: draft.partnerPersonId, status: "PENDING" } });
      history.push({
        assignmentId: draft.slotId, churchId: pilot.churchId, ministryId: String(module?.ministryId ?? ""),
        positionId: draft.slotId, slotId: draft.slotId, rosterId: draft.rosterId, serviceAt: serviceAt.toISOString(),
        status: "PENDING", personId: draft.personId, partnerPersonId: draft.partnerPersonId,
      });
      const slot = empty.find(item => item.id === draft.slotId);
      if (slot) slot.assignments = [{ id: draft.slotId }];
      created += 1;
    }
    for (const gap of plan.unfilled) {
      const slot = empty.find(item => item.id === gap.slotId);
      if (slot) slot.openReason = openVacancyText(gap.reasons);
    }
  }
  return created;
}

function isManualCommunion(name: unknown, raw: unknown): boolean {
  const label = typeof name === "string" ? name : "";
  return label.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim() === "ceia"
    && effectiveInviteLimit(label, raw, 0) === 0;
}

export async function recordNoticeDeliveries(db: Db, notices: Array<{ id: string; churchId: string }>, now = new Date()) {
  if (!db.rosterNoticeDelivery?.createMany || !notices.length) return { recorded: 0, whatsapp: "skipped" as const };
  const whatsapp = whatsappDevApproved();
  const data = notices.flatMap(notice => [
    { churchId: notice.churchId, noticeId: notice.id, channel: "PORTAL", dedupeKey: `portal:${notice.id}`, status: "RECORDED", createdAt: now },
    { churchId: notice.churchId, noticeId: notice.id, channel: "WHATSAPP", dedupeKey: `whatsapp:${notice.id}`, status: whatsapp ? "RECORDED" : "SKIPPED", createdAt: now },
  ]);
  const saved = await db.rosterNoticeDelivery.createMany({ data, skipDuplicates: true });
  return { recorded: saved.count, whatsapp: whatsapp ? "recorded" as const : "skipped" as const };
}

export async function publishAssignmentNotices(
  db: Db,
  pilot: { churchId: string },
  assignments: Array<{ id: string; personId: string; partnerPersonId?: string | null }>,
  now = new Date(),
) {
  const table = (db as { rosterNotice?: { createMany?: (args: unknown) => Promise<{ count: number }> } }).rosterNotice;
  if (!table?.createMany || !assignments.length) return 0;
  const data = assignments.flatMap(assignment => [assignment.personId, assignment.partnerPersonId].filter((id): id is string => Boolean(id)).map(personId => ({
    id: ["published", assignment.id, personId].join(":"), churchId: pilot.churchId, personId, kind: "published",
    title: "Você tem uma nova escala", body: "Consulte sua escala e responda pelo portal.", path: "/app/servir/meu-espaco/", createdAt: now,
  })));
  const saved = await table.createMany({ data, skipDuplicates: true });
  await recordNoticeDeliveries(db, data.map(notice => ({ id: notice.id, churchId: notice.churchId })), now);
  return saved.count;
}

export function describePermissions(access: RosterAccess) {
  return publicPermissions(access);
}

async function first(db: Db, key: string, args: unknown) {
  const table = db[key] as { findFirst?: (query: unknown) => Promise<unknown> } | undefined;
  if (!table?.findFirst) return null;
  return table.findFirst(args);
}

export { openVacancyText, effectiveInviteLimit };
