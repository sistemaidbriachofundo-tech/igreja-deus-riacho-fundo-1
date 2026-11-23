import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
} from "@nestjs/common";
import {
  canAdministerMinistries,
  canManageSpecificMinistry,
  type RosterPreviewDto,
} from "@idbrf/shared";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { SystemSettingsService } from "../piloto/system-settings.service";
import { churchDayKey, churchMonthRange } from "./church-day";
import { assertDistinctRosterPartners, assertNoRosterDayConflict, writeRosterAssignment } from "./roster-assignment-transaction";
import { previewSlots } from "./preview-domain/scheduler";
import { DEFAULT_RULES, type Candidate, type ExistingAssignment } from "./preview-domain/types";
import { utcWeeklyWindowsToRiachoLocal } from "./preview-domain/timezone-availability";

import { assertOpenModuleSlot, assertSlotEligibility, cultTypeAt, CULT_TYPES, isModuleVolunteer, type CultType } from "./roster-operating-rules";
import { loadMonthState } from "./roster-month-load";
import { capacitySlotChanges, decideMonthSave, draftsToPersist, monthFingerprint, presentMonthlySimulation, type MonthCapacityRequest, type MonthDecision, type MonthPin } from "./roster-month-plan";
import { openVacancyText, responseStatuses, rosterInScope, surveyIsOpen } from "./roster-module-policy";
import { inviteSlotCandidate, listMyRosterMemberInvitations, listSlotCandidates, respondRosterMemberInvitation } from "./roster-team";
import {
  appendParticipantResponse,
  assertCanManageRosterMonth,
  assertRosterModuleAllowed,
  canManageRosterMonth,
  capacityView,
  describePermissions,
  loadRosterAccess,
  responseHistory,
  rulesWithTeam,
  volunteerIdsByModule,
} from "./roster-module-runtime";

function monthRange(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException("Informe o mês no formato AAAA-MM.");
  return churchMonthRange(month);
}

function surveyPeriod(now = new Date(), openDay = 25) {
  const [year, month] = churchDayKey(now).split("-").map(Number);
  return { month: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7), open: surveyIsOpen(now, openDay) };
}

function rosterCultType(roster: { serviceType?: string | null; serviceAt: Date }): CultType {
  return CULT_TYPES.includes(roster.serviceType as CultType) ? roster.serviceType as CultType : cultTypeAt(roster.serviceAt);
}

const ACTIVE = ["PENDING", "CONFIRMED"] as const;

type Pilot = { organizationId: string; churchId: string };

type MinistryRef = {
  id: string;
  name: string;
  slug: string;
  leaderPersonId: string | null;
};

type RosterRef = {
  id: string;
  organizationId: string;
  churchId: string;
  ministryId: string | null;
  moduleId?: string | null;
  title: string;
  serviceAt: Date;
  status: string;
  ministry: MinistryRef | null;
};

type SlotRef = {
  id: string;
  roleLabel: string;
  requiresCouple: boolean;
  requiredQualification?: string | null;
  sector?: string | null;
  zone?: string | null;
  side?: string | null;
  sortOrder: number;
  roster: RosterRef;
};

type AssignmentRow = {
  id: string;
  slotId: string;
  personId: string;
  partnerPersonId: string | null;
  status: string;
  substituteForId: string | null;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  slot?: SlotRef;
};

/**
 * Agenda pessoal e operações de escala desta frente.
 * Não enfileira WhatsApp, e-mail ou push — a pessoa confirma na própria agenda.
 */
@Injectable()
export class PersonalRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    @Optional() private readonly settings?: SystemSettingsService,
  ) {}

  async listMine(actor: AuthUser) {
    if (!actor.personId) {
      throw new ForbiddenException({
        code: "PERSON_REQUIRED",
        message: "A sessão não está vinculada a uma pessoa.",
      });
    }
    const pilot = await this.pilot.getPilotChurch();
    const rows = await this.prisma.rosterAssignment.findMany({
      where: {
        OR: [
          { personId: actor.personId },
          { partnerPersonId: actor.personId },
        ],
        slot: {
          roster: {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            status: { in: ["PUBLISHED", "CLOSED"] },
          },
        },
      },
      include: {
        person: { select: { displayName: true } },
        partner: { select: { displayName: true } },
        slot: {
          include: {
            roster: { include: { ministry: true, module: { select: { name: true, locationName: true, arrivalContactName: true, arrivalInstructions: true } } } },
          },
        },
      },
    });

    const mine = rows.filter(
      (row) =>
        row.slot?.roster &&
        row.slot.roster.organizationId === pilot.organizationId &&
        row.slot.roster.churchId === pilot.churchId &&
        (row.personId === actor.personId ||
          row.partnerPersonId === actor.personId),
    );
    const counts = new Map<string, number>();
    for (const row of mine) {
      if (!isActive(row.status) || !row.slot) continue;
      const key = churchDayKey(row.slot.roster.serviceAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const history = await responseHistory(this.prisma as never, mine.map(row => row.id));
    const invites = await this.openInvites(actor.personId, pilot.churchId);
    const assignments = mine.flatMap((row) => {
      if (!row.slot) return [];
      return [this.toMineDto(row as AssignmentRow & { slot: SlotRef }, actor.personId, counts, history.get(row.id) ?? [])];
    })
      .sort(
        (a, b) =>
          Date.parse(a.serviceAt) - Date.parse(b.serviceAt) ||
          a.title.localeCompare(b.title, "pt-BR"),
      );

    return {
      personId: actor.personId,
      source: "jwt" as const,
      notified: false,
      assignments,
      invites,
    };
  }

  async preview(actor: AuthUser, rosterId: string): Promise<RosterPreviewDto> {
    const pilot = await this.pilot.getPilotChurch();
    return (await this.planPreview(actor, rosterId, pilot, this.prisma)).dto;
  }

  async applyPreview(actor: AuthUser, rosterId: string, fingerprint: string) {
    const pilot = await this.pilot.getPilotChurch();
    return writeRosterAssignment(this.prisma, async tx => {
      const { dto, drafts } = await this.planPreview(actor, rosterId, pilot, tx);
      if (!dto.fingerprint || dto.fingerprint !== fingerprint) {
        throw new ConflictException("O rascunho ou as sugestões mudaram. Atualize a prévia antes de preencher.");
      }

      for (const draft of drafts) {
        const assignment = await tx.rosterAssignment.create({ data: {
          slotId: draft.slotId, personId: draft.personId, partnerPersonId: draft.partnerPersonId, status: "PENDING",
        } });
        await tx.auditLog.create({ data: {
          actorUserId: actor.userId, action: "roster.assignment.create", resourceType: "roster_assignment",
          resourceId: assignment.id, organizationId: pilot.organizationId, churchId: pilot.churchId,
          metadata: { slotId: draft.slotId, personId: draft.personId, partnerPersonId: draft.partnerPersonId ?? null,
            sameDay: true, notified: false, source: "preview" },
        } });
      }
      return { applied: drafts.length, unfilled: dto.positions.filter(position => !position.personName) };
    });
  }

  private async planPreview(
    actor: AuthUser,
    rosterId: string,
    pilot: Awaited<ReturnType<PilotService["getPilotChurch"]>>,
    db: Prisma.TransactionClient,
  ) {
    const roster = await db.roster.findFirst({
      where: { id: rosterId, organizationId: pilot.organizationId, churchId: pilot.churchId },
      include: {
        ministry: { select: { id: true, name: true, slug: true, leaderPersonId: true } },
        module: { select: { id: true, rules: true } },
        slots: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: { assignments: { where: { status: { in: [...ACTIVE] } }, select: { id: true }, take: 1 } },
        },
      },
    });
    if (!roster?.ministry) throw new NotFoundException("Escala de ministério não encontrada.");
    this.assertCanOperateMinistry(actor, roster.ministry, pilot, roster);
    await assertRosterModuleAllowed(db as never, actor, roster.ministry, roster.moduleId, pilot);
    if (roster.status === "CLOSED") throw new ConflictException("A escala já foi encerrada.");

    const openSlots = roster.slots.filter(slot => !slot.assignments.length);
    if (!openSlots.length) return { dto: { rosterId, positions: [] } as RosterPreviewDto, drafts: [] };

    const scope = { organizationId: pilot.organizationId, churchId: pilot.churchId };
    const ministryId = roster.ministry.id;
    const teams = roster.module?.id ? await volunteerIdsByModule(db as never, [roster.module.id]) : null;
    const configured = rulesWithTeam(roster.module?.rules, roster.module?.id, teams);
    const activeMembers = await db.ministryMembership.findMany({
      where: { ...scope, ministryId, status: "ATIVO", person: { status: "ACTIVE" } },
      select: { personId: true, role: true, person: { select: { displayName: true } } },
    });
    const members = activeMembers.filter(member => isModuleVolunteer(configured, member.personId));
    if (!members.length) {
      return { dto: { rosterId, positions: openSlots.map(({ id, roleLabel }) => ({
        slotId: id, roleLabel, personName: null, partnerName: null, reasons: ["EMPTY_TEAM"],
      })) } as RosterPreviewDto, drafts: [] };
    }

    const personIds = members.map(member => member.personId);
    const [year, month] = churchDayKey(roster.serviceAt).slice(0, 7).split("-").map(Number);
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1, 3));
    const nextMonth = new Date(Date.UTC(year, month, 1, 3));
    const rules = { ...DEFAULT_RULES, minIntervalDays: configured.minIntervalDays, maxMonthlyAssignments: configured.maxMonthlyAssignments };
    const interval = rules.minIntervalDays * 86_400_000;
    const [history, availability, impediments] = await Promise.all([
      db.rosterAssignment.findMany({
        where: {
          status: { in: [...ACTIVE] },
          OR: [{ personId: { in: personIds } }, { partnerPersonId: { in: personIds } }],
          slot: { roster: { ...scope, serviceAt: { gte: new Date(+firstOfMonth - interval), lt: new Date(+nextMonth + interval) } } },
        },
        select: {
          id: true, personId: true, partnerPersonId: true, status: true,
          slot: { select: { id: true, roster: { select: { id: true, ministryId: true, serviceAt: true } } } },
        },
      }),
      db.volunteerAvailability.findMany({
        where: { ...scope, personId: { in: personIds }, active: true },
        select: { personId: true, weekday: true, startMinute: true, endMinute: true },
      }),
      db.volunteerImpediment.findMany({
        where: { ...scope, personId: { in: personIds }, startsAt: { lte: roster.serviceAt }, endsAt: { gt: roster.serviceAt } },
        select: { personId: true, startsAt: true, endsAt: true },
      }),
    ]);
    const names = new Map(members.map(member => [member.personId, member.person.displayName]));
    const existing: ExistingAssignment[] = history.map(row => ({
      assignmentId: row.id, churchId: pilot.churchId, ministryId: row.slot.roster.ministryId ?? "",
      positionId: row.slot.id, slotId: row.slot.id, rosterId: row.slot.roster.id,
      serviceAt: row.slot.roster.serviceAt.toISOString(), status: row.status,
      personId: row.personId, partnerPersonId: row.partnerPersonId,
    }));
    const partners = new Map(configured.couples.flatMap(([a, b]) => [[a, b], [b, a]] as const));
    const candidates: Candidate[] = members.map(member => ({
      personId: member.personId,
      active: true,
      churchIds: [pilot.churchId],
      ministryIds: [ministryId],
      qualifiedPositionIds: openSlots.map(slot => slot.id),
      approvedRoleTags: Object.keys(configured.qualifications).filter(tag => configured.qualifications[tag].includes(member.personId)),
      spousePersonId: partners.get(member.personId),
      availability: utcWeeklyWindowsToRiachoLocal(availability.filter(window => window.personId === member.personId)),
      impediments: impediments.filter(item => item.personId === member.personId)
        .map(item => ({ startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString() })),
    }));
    const plan = previewSlots(openSlots.map(slot => ({
      slotId: slot.id, rosterId, churchId: pilot.churchId, ministryId,
      positionId: slot.id, roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple,
      requiredRoleTags: slot.requiredQualification ? [slot.requiredQualification] : [],
      serviceAt: roster.serviceAt.toISOString(), serviceType: rosterCultType(roster),
    })), candidates, existing, rules);
    const suggestions = new Map(plan.drafts.map(item => [item.slotId, item]));
    const unfilled = new Map(plan.unfilled.map(item => [item.slotId, item.reasons]));
    const canApply = roster.status === "DRAFT" && +roster.serviceAt > Date.now() && plan.drafts.length > 0;
    const fingerprint = canApply ? createHash("sha256").update(JSON.stringify([
      rosterId, roster.serviceAt, openSlots.map(slot => slot.id), plan.drafts,
    ])).digest("hex") : undefined;
    const dto: RosterPreviewDto = {
      rosterId,
      ...(fingerprint ? { fingerprint } : {}),
      positions: openSlots.map(slot => {
        const suggestion = suggestions.get(slot.id);
        return {
          slotId: slot.id, roleLabel: slot.roleLabel,
          personName: suggestion ? names.get(suggestion.personId) ?? null : null,
          partnerName: suggestion?.partnerPersonId ? names.get(suggestion.partnerPersonId) ?? null : null,
          reasons: unfilled.get(slot.id) ?? [],
          ...(unfilled.get(slot.id)?.length ? { openVacancy: openVacancyText(unfilled.get(slot.id) ?? []) } : {}),
        };
      }),
    };
    return { dto, drafts: plan.drafts };
  }

  private async surveyOpenDay(now: Date) {
    if (!this.settings) return 25;
    try {
      const pilot = await this.pilot.getPilotChurch();
      return await this.settings.getSurveyOpenDay(pilot, now);
    } catch {
      return 25;
    }
  }

  async monthlySurvey(actor: AuthUser, now = new Date()) {
    const { churchId, organizationId } = await this.pilot.getPilotChurch();
    const scope = { churchId, organizationId };
    if (!actor.personId) throw new ForbiddenException("A sessão precisa estar vinculada a uma pessoa.");
    const openDay = await this.surveyOpenDay(now);
    const { month, open } = surveyPeriod(now, openDay);
    const memberships = await this.prisma.ministryMembership.findMany({
      where: { ...scope, personId: actor.personId, status: "ATIVO", person: { status: "ACTIVE" } }, select: { ministryId: true },
    });
    const [rows, response] = await Promise.all([
      this.prisma.roster.findMany({ where: {
        ...scope, ministryId: { in: memberships.map(item => item.ministryId) }, serviceAt: monthRange(month), status: { in: ["DRAFT", "PUBLISHED"] },
      }, select: { id: true, title: true, serviceAt: true, moduleId: true, module: { select: { id: true, name: true, rules: true } } }, orderBy: { serviceAt: "asc" } }),
      this.prisma.rosterAvailabilityResponse.findUnique({ where: { churchId_personId_month: { churchId: scope.churchId, personId: actor.personId, month } } }),
    ]);
    const teams = await volunteerIdsByModule(this.prisma as never, rows.flatMap(row => row.module?.id ? [row.module.id] : []));
    const rosters = rows.filter(row => isModuleVolunteer(rulesWithTeam(row.module?.rules, row.module?.id, teams), actor.personId!))
      .map(row => ({ ...row, module: row.module ? { name: row.module.name } : null }));
    const allowed = new Set(rosters.map(roster => roster.id));
    return { month, open, answered: Boolean(response), availableRosterIds: response?.rosterIds.filter(id => allowed.has(id)) ?? [], rosters };
  }

  async answerMonthlySurvey(actor: AuthUser, month: string, rosterIds: string[], now = new Date()) {
    const survey = await this.monthlySurvey(actor, now);
    if (!survey.open || month !== survey.month) throw new ConflictException("A pesquisa deste mês está fechada.");
    if (!survey.rosters.length) throw new ForbiddenException("Nenhum culto disponível para sua equipe.");
    const allowed = new Set(survey.rosters.map(roster => roster.id));
    const ids = [...new Set(rosterIds)];
    if (ids.some(id => !allowed.has(id))) throw new BadRequestException("Selecione apenas cultos disponíveis para sua equipe.");
    const { churchId } = await this.pilot.getPilotChurch();
    const key = { churchId, personId: actor.personId!, month };
    await this.prisma.rosterAvailabilityResponse.upsert({
      where: { churchId_personId_month: key }, create: { ...key, rosterIds: ids }, update: { rosterIds: ids },
    });
    return { month, answered: true, availableRosterIds: ids };
  }

  /**
   * Primeiro uso do sorteio mensal do Louvor: prepara UMA equipe com vagas genéricas.
   * Não presume quem é baterista, tecladista ou ministro sem habilitação documentada.
   * O responsável pode depois personalizar funções/habilitações em Módulos e regras.
   * Só é executado mediante clique autorizado; não publica nem emite convites.
   */
  async prepareLouvorMonth(actor: AuthUser, ministryId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const ministry = await this.requireMinistry(ministryId, pilot);
    if (!/^louvor(?:-|$)/i.test(ministry.slug)) {
      throw new BadRequestException("A preparação automática inicial é exclusiva do Louvor.");
    }
    assertCanManageRosterMonth(actor, ministry, pilot);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT id FROM ministries WHERE id = ${ministryId} FOR UPDATE`;
      const existing = await tx.ministryRosterModule.findFirst({
        where: { ministryId }, select: { id: true, name: true },
      });
      if (existing) return { moduleId: existing.id, created: false, people: 0 };
      const members = await tx.ministryMembership.findMany({
        where: { ministryId, churchId: pilot.churchId, organizationId: pilot.organizationId,
          status: "ATIVO", endedAt: null, person: { status: "ACTIVE" } },
        select: { id: true, personId: true },
      });
      if (!members.length) {
        throw new ConflictException("Cadastre integrantes ativos no Louvor antes de gerar o mês.");
      }
      // Início seguro: posições genéricas. Cargos específicos exigem habilitação prévia.
      const genericPositions = [{ label: "Equipe de Louvor", count: 7, couple: false }];
      const rules = {
        positions: { thursday_evening: genericPositions, sunday_morning: genericPositions,
          sunday_evening: genericPositions },
        qualifications: {}, couples: [], minIntervalDays: 7, maxMonthlyAssignments: 4,
        substituteInviteLimit: 0, substituteInviteHours: 12,
        volunteerIds: members.map(member => member.personId),
      };
      const module = await tx.ministryRosterModule.create({
        data: { ministryId, name: "Louvor", nameKey: "louvor", rules },
        select: { id: true },
      });
      await tx.ministryRosterModuleMembership.createMany({
        data: members.map(member => ({
          organizationId: pilot.organizationId, churchId: pilot.churchId,
          ministryId, moduleId: module.id, membershipId: member.id, personId: member.personId,
        })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "roster.louvor.month_bootstrap",
        resourceType: "ministry_roster_module", resourceId: module.id,
        churchId: pilot.churchId, organizationId: pilot.organizationId,
        metadata: { ministryId, activePeople: members.length, positions: "generic", published: false },
      } });
      return { moduleId: module.id, created: true, people: members.length };
    });
  }

  async monthlySimulation(actor: AuthUser, ministryId: string, request: { month: string; moduleId?: string; revision?: string; decisions?: MonthDecision[]; capacities?: MonthCapacityRequest[]; fillOnlyOpen?: boolean }) {
    const pilot = await this.pilot.getPilotChurch();
    const loaded = await this.monthState(actor, ministryId, request.month, pilot);
    this.assertModuleFilter(loaded, request.moduleId);
    const state = request.moduleId ? { ...loaded, modules: loaded.modules.filter(module => module.id === request.moduleId) } : loaded;
    if (request.revision && request.revision !== monthFingerprint(state)) {
      throw new ConflictException({ code: "ROSTER_PREVIEW_STALE", message: "A prévia mudou. Atualize o mês e tente de novo." });
    }
    const simulation = presentMonthlySimulation(state, request);
    const refused = (request.decisions ?? []).find(decision => decision.personId && simulation.rosters.some(roster => roster.positions.some(position => position.slotId === decision.slotId && !position.personId)));
    if (refused) {
      const position = simulation.rosters.flatMap(roster => roster.positions).find(item => item.slotId === refused.slotId);
      throw new ConflictException({ code: "ROSTER_NOT_ELIGIBLE", message: position?.openVacancy ?? "A pessoa fixada não pode ocupar esta vaga.", reasonCodes: position?.reasons ?? [], slotId: refused.slotId });
    }
    return simulation;
  }

  async saveMonth(actor: AuthUser, ministryId: string, month: string, request: { fingerprint: string; pins?: MonthPin[]; decisions?: MonthDecision[]; capacities?: MonthCapacityRequest[]; recalculate?: boolean; fillOnlyOpen?: boolean; moduleId?: string }) {
    const pilot = await this.pilot.getPilotChurch();
    const ministry = await this.requireMinistry(ministryId, pilot);
    this.assertCanOperateMinistry(actor, ministry, pilot);
    const loaded = await this.monthState(actor, ministryId, month, pilot);
    this.assertModuleFilter(loaded, request.moduleId);
    const initial = request.moduleId ? { ...loaded, modules: loaded.modules.filter(module => module.id === request.moduleId) } : loaded;
    const decision = decideMonthSave(initial, request);
    if (decision.action === "replay") return { savedRosters: 0 };
    if (decision.action !== "write") {
      throw new ConflictException(decision);
    }
    return writeRosterAssignment(this.prisma, async tx => {
      // Impede duas sessões de criar as mesmas vagas antes da releitura do mês.
      await tx.$executeRaw`SELECT id FROM ministries WHERE id = ${ministryId} FOR UPDATE`;
      const reloaded = await this.monthState(actor, ministryId, month, pilot, tx);
      const fresh = request.moduleId ? { ...reloaded, modules: reloaded.modules.filter(module => module.id === request.moduleId) } : reloaded;
      const again = decideMonthSave(fresh, request);
      if (again.action === "replay") return { savedRosters: 0 };
      if (again.action !== "write") throw new ConflictException(again);
      const touched = new Set<string>();
      for (const service of again.simulation.services) {
        if (service.status === "CANCELLED" || service.status === "PUBLISHED" || service.status === "CLOSED") continue;
        if (!service.persisted) {
          const created = await tx.roster.create({
            data: {
              organizationId: pilot.organizationId, churchId: pilot.churchId, ministryId, moduleId: service.moduleId,
              title: service.title, serviceAt: new Date(service.serviceAt), serviceType: service.serviceType, status: "DRAFT",
              slots: { create: service.slots.map((slot, sortOrder) => ({ roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple, requiredQualification: slot.requiredQualification, sortOrder })) },
            },
            include: { slots: { orderBy: { sortOrder: "asc" } } },
          });
          created.slots.forEach((slot, index) => { if (service.slots[index]) service.slots[index].id = slot.id; });
          service.rosterId = created.id;
          touched.add(created.id);
          continue;
        }
        if (service.status !== "DRAFT" || !service.rosterId) continue;
        const existing = fresh.rosters.find(roster => roster.id === service.rosterId);
        const changes = capacitySlotChanges(service, existing?.slots.map(slot => slot.id) ?? []);
        if (changes.removeIds.length) {
          await tx.rosterSlot.deleteMany({ where: { id: { in: changes.removeIds }, rosterId: service.rosterId, assignments: { none: { status: { in: ["PENDING", "CONFIRMED"] } } } } });
          touched.add(service.rosterId);
        }
        let sortOrder = existing?.slots.length ?? 0;
        for (const slot of changes.create) {
          const created = await tx.rosterSlot.create({ data: { rosterId: service.rosterId, roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple, requiredQualification: slot.requiredQualification, sortOrder } });
          slot.id = created.id;
          sortOrder += 1;
          touched.add(service.rosterId);
        }
      }
      for (const item of draftsToPersist(again.simulation)) {
        const slotId = item.slot.id;
        const rosterId = item.service.rosterId;
        if (!slotId || !item.slot.personId || !rosterId) continue;
        const existing = await tx.rosterAssignment.findFirst({ where: { slotId, status: { in: ["PENDING", "CONFIRMED"] } }, select: { personId: true } });
        if (existing?.personId === item.slot.personId) continue;
        if (existing) throw new ConflictException({ code: "ROSTER_PREVIEW_STALE", message: "A vaga foi preenchida por outra gravação. Atualize o mês e tente de novo." });
        await tx.rosterAssignment.create({ data: { slotId, personId: item.slot.personId, partnerPersonId: item.slot.partnerPersonId ?? null, status: "PENDING" } });
        touched.add(rosterId);
      }
      return { savedRosters: touched.size };
    });
  }

  private async monthState(actor: AuthUser, ministryId: string, month: string, pilot: Pilot, db: Pick<Prisma.TransactionClient, "ministry"> = this.prisma) {
    const ministry = await this.requireMinistry(ministryId, pilot, db);
    this.assertCanOperateMinistry(actor, ministry, pilot);
    if (ministry.slug === "atmosfera") assertCanManageRosterMonth(actor, ministry, pilot);
    const access = await loadRosterAccess(db as never, actor, ministry, pilot);
    const state = await loadMonthState(db as never, pilot, ministryId, month, ministry.slug);
    if (state && /^louvor(?:-|$)/i.test(ministry.slug)) {
      const block = await this.settings?.getLouvorWeekBlock(pilot, ministryId);
      state.modules = state.modules.map(module => ({ ...module, louvorWeekBlock: block !== false }));
    }
    if (!state) throw new ConflictException({ code: "ROSTER_PREVIEW_UNVERIFIED", message: "A simulação não pôde ser conferida com a pesquisa, a disponibilidade e o histórico." });
    if (access.scope === "modules") state.modules = state.modules.filter(module => access.moduleIds.includes(module.id));
    return state;
  }

  async monthlyPreview(actor: AuthUser, ministryId: string, month: string) {
    const simulation = await this.monthlySimulation(actor, ministryId, { month });
    return { ...simulation, fingerprint: simulation.revision };
  }

  private assertModuleFilter(state: { modules: { id: string }[] }, moduleId?: string) {
    if (moduleId && !state.modules.some(module => module.id === moduleId)) {
      throw new ForbiddenException({ code: "ROSTER_MODULE_FORBIDDEN", message: "Sem permissão neste módulo." });
    }
  }

  async listMinistry(actor: AuthUser, ministryId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const ministry = await this.requireMinistry(ministryId, pilot);
    this.assertCanOperateMinistry(actor, ministry, pilot);
    const access = await loadRosterAccess(this.prisma as never, actor, ministry, pilot);

    const [rows, modules] = await Promise.all([
      this.prisma.roster.findMany({
        where: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: ministry.id,
        },
        orderBy: { serviceAt: "asc" },
        include: {
          module: { select: { name: true, rules: true } },
          slots: {
            orderBy: { sortOrder: "asc" },
            include: {
              assignments: { include: { person: { select: { displayName: true } }, partner: { select: { displayName: true } } } },
            },
          },
        },
      }),
      this.prisma.ministryRosterModule.findMany({
        where: { ministryId: ministry.id }, select: { id: true, name: true, rules: true }, orderBy: { name: "asc" },
      }),
    ]);
    const visibleModules = modules.filter(module => rosterInScope(module.id, access));
    const teams = await volunteerIdsByModule(this.prisma as never, visibleModules.map(module => module.id));
    const visibleRosters = rows.filter(row => rosterInScope(row.moduleId, access));

    return {
      ministryId: ministry.id,
      permissions: { ...describePermissions(access), manageRosterMonth: canManageRosterMonth(actor, ministry, pilot) },
      modules: visibleModules.map(module => ({ ...module, rules: teams ? { ...(module.rules && typeof module.rules === "object" ? module.rules as object : {}), volunteerIds: teams.get(module.id) ?? [] } : module.rules })),
      notified: false,
      rosters: await Promise.all(visibleRosters.map(async (row) => {
        const capacity = await capacityView(this.prisma as never, row, true);
        return {
        id: row.id,
        ministryId: row.ministryId,
        moduleId: row.moduleId,
        title: row.title,
        serviceAt: row.serviceAt.toISOString(),
        status: row.status,
        ...(capacity ? { capacity } : {}),
        slots: row.slots.map((slot) => ({
          id: slot.id,
          roleLabel: slot.roleLabel,
          requiresCouple: slot.requiresCouple,
          requiredQualification: slot.requiredQualification,
          sector: slot.sector,
          zone: slot.zone,
          side: slot.side,
          sortOrder: slot.sortOrder,
          assignments: slot.assignments.map(assignment => ({
            ...this.toAssignmentDto(assignment),
            personName: assignment.person?.displayName ?? null,
            partnerName: assignment.partner?.displayName ?? null,
          })),
        })),
        };
      })),
    };
  }

  async listMyMembershipInvitations(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    return listMyRosterMemberInvitations(this.prisma, actor, pilot);
  }

  async acceptMembershipInvitation(actor: AuthUser, invitationId: string) {
    const pilot = await this.pilot.getPilotChurch();
    return respondRosterMemberInvitation(this.prisma, actor, pilot, invitationId, "ACCEPTED");
  }

  async declineMembershipInvitation(actor: AuthUser, invitationId: string) {
    const pilot = await this.pilot.getPilotChurch();
    return respondRosterMemberInvitation(this.prisma, actor, pilot, invitationId, "DECLINED");
  }

  async slotCandidates(actor: AuthUser, slotId: string) {
    const pilot = await this.pilot.getPilotChurch();
    return listSlotCandidates(this.prisma, actor, pilot, slotId);
  }

  async inviteSlot(actor: AuthUser, slotId: string, input: { personId: string; partnerPersonId?: string }) {
    const pilot = await this.pilot.getPilotChurch();
    return inviteSlotCandidate(this.prisma, actor, pilot, slotId, input);
  }

  async assign(
    actor: AuthUser,
    slotId: string,
    input: {
      personId: string;
      partnerPersonId?: string;
      coupleExceptionId?: string;
      fromMonthlyPreview?: boolean;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const slot = await this.requireSlot(slotId, pilot);
    this.assertCanOperateMinistry(actor, slot.roster.ministry, pilot, slot.roster);
    await assertRosterModuleAllowed(this.prisma as never, actor, slot.roster.ministry, slot.roster.moduleId, pilot);
    this.assertRosterOpen(slot.roster);

    const personId = requiredPersonId(input.personId);
    const partnerPersonId = optionalPersonId(input.partnerPersonId);
    assertDistinctRosterPartners(personId, partnerPersonId);
    await this.requirePerson(personId, pilot.organizationId);
    if (partnerPersonId) {
      await this.requirePerson(partnerPersonId, pilot.organizationId);
    }
    if (slot.requiresCouple && !partnerPersonId) {
      await this.assertCoupleException(pilot, {
        personId,
        slotId: slot.id,
        rosterId: slot.roster.id,
        ministryId: slot.roster.ministryId,
        coupleExceptionId: input.coupleExceptionId,
      });
    }

    const personIds = [personId, partnerPersonId].filter(
      (id): id is string => Boolean(id),
    );
    await this.assertSchedulable(pilot.churchId, slot.roster.serviceAt, personIds);
    const created = await writeRosterAssignment(this.prisma, async (tx) => {
      const current = await this.requireSlot(slotId, pilot, tx);
      this.assertCanOperateMinistry(actor, current.roster.ministry, pilot, current.roster);
      await assertRosterModuleAllowed(tx as never, actor, current.roster.ministry, current.roster.moduleId, pilot);
      this.assertRosterOpen(current.roster);
      if (+current.roster.serviceAt !== +slot.roster.serviceAt) {
        throw new ConflictException("O horário do culto mudou. Atualize a escala e tente novamente.");
      }
      if (input.fromMonthlyPreview) {
        if (current.roster.status !== "DRAFT") throw new ConflictException("A sugestão só pode ser salva em uma escala em rascunho.");
        const month = churchDayKey(current.roster.serviceAt).slice(0, 7);
        const responses = await tx.rosterAvailabilityResponse.findMany({
          where: { churchId: pilot.churchId, month, personId: { in: personIds }, rosterIds: { has: current.roster.id } }, select: { personId: true },
        });
        const eligible = await tx.ministryMembership.count({ where: {
          churchId: pilot.churchId, ministryId: current.roster.ministryId ?? "", status: "ATIVO",
          personId: { in: personIds }, person: { status: "ACTIVE" },
        } });
        if (responses.length !== personIds.length || eligible !== personIds.length) {
          throw new ConflictException("A disponibilidade ou a equipe mudou. Gere uma nova prévia.");
        }
      }
      await assertOpenModuleSlot(tx, current);
      await assertSlotEligibility(tx, current, personIds);
      await assertNoRosterDayConflict(tx, {
        churchId: pilot.churchId, serviceAt: current.roster.serviceAt, personIds, conflictCode: "ROSTER_SAME_DAY",
      });
      const assignment = await tx.rosterAssignment.create({
        data: {
          slotId: slot.id,
          personId,
          partnerPersonId,
          status: "PENDING",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.assignment.create",
          resourceType: "roster_assignment",
          resourceId: assignment.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            slotId: slot.id,
            personId,
            partnerPersonId,
            sameDay: true,
            notified: false,
          },
        },
      });
      return assignment;
    });

    return {
      ...this.toAssignmentDto(created),
      persisted: true,
      notified: false,
    };
  }

  async confirm(actor: AuthUser, assignmentId: string) {
    return this.respond(actor, assignmentId, "CONFIRMED");
  }

  async decline(actor: AuthUser, assignmentId: string) {
    return this.respond(actor, assignmentId, "DECLINED");
  }

  async substitute(
    actor: AuthUser,
    assignmentId: string,
    input: { personId: string; partnerPersonId?: string; coupleExceptionId?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const loaded = await this.requireAssignment(assignmentId, pilot);
    this.assertCanOperateMinistry(
      actor,
      loaded.slot.roster.ministry,
      pilot,
      loaded.slot.roster,
    );
    await assertRosterModuleAllowed(this.prisma as never, actor, loaded.slot.roster.ministry, loaded.slot.roster.moduleId, pilot);
    this.assertRosterOpen(loaded.slot.roster);
    this.assertNotSubstituted(loaded);

    const personId = requiredPersonId(input.personId);
    const partnerPersonId = optionalPersonId(input.partnerPersonId);
    assertDistinctRosterPartners(personId, partnerPersonId);
    await this.requirePerson(personId, pilot.organizationId);
    if (partnerPersonId) {
      await this.requirePerson(partnerPersonId, pilot.organizationId);
    }
    if (loaded.slot.requiresCouple && !partnerPersonId) {
      await this.assertCoupleException(pilot, {
        personId,
        slotId: loaded.slot.id,
        rosterId: loaded.slot.roster.id,
        ministryId: loaded.slot.roster.ministryId,
        coupleExceptionId: input.coupleExceptionId,
      });
    }

    const personIds = [personId, partnerPersonId].filter(
      (id): id is string => Boolean(id),
    );
    await this.assertSchedulable(
      pilot.churchId,
      loaded.slot.roster.serviceAt,
      personIds,
    );
    const created = await writeRosterAssignment(this.prisma, async (tx) => {
      const current = await this.requireAssignment(assignmentId, pilot, tx);
      this.assertRosterOpen(current.slot.roster);
      this.assertNotSubstituted(current);
      if (+current.slot.roster.serviceAt !== +loaded.slot.roster.serviceAt) {
        throw new ConflictException("O horário do culto mudou. Atualize a escala e tente novamente.");
      }
      await assertOpenModuleSlot(tx, current.slot, assignmentId);
      await assertSlotEligibility(tx, current.slot, personIds);
      await assertNoRosterDayConflict(tx, {
        churchId: pilot.churchId, serviceAt: current.slot.roster.serviceAt, personIds,
        excludeAssignmentId: current.id, conflictCode: "ROSTER_SAME_DAY",
      });
      await tx.rosterAssignment.update({
        where: { id: loaded.id },
        data: { status: "SUBSTITUTED" },
      });
      const substitute = await tx.rosterAssignment.create({
        data: {
          slotId: loaded.slotId,
          personId,
          partnerPersonId,
          status: "PENDING",
          substituteForId: loaded.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.assignment.substitute",
          resourceType: "roster_assignment",
          resourceId: substitute.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            replacedAssignmentId: loaded.id,
            personId,
            requiresConsent: true,
            notified: false,
          },
        },
      });
      return substitute;
    });

    return {
      ...this.toAssignmentDto(created),
      persisted: true,
      requiresConsent: true,
      notified: false,
    };
  }

  private async respond(
    actor: AuthUser,
    assignmentId: string,
    status: "CONFIRMED" | "DECLINED",
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const now = new Date();
    const updated = await writeRosterAssignment(this.prisma, async (tx) => {
      const loaded = await this.requireAssignment(assignmentId, pilot, tx);
      this.assertCanRespond(actor, loaded, pilot);
      this.assertRosterOpen(loaded.slot.roster);
      this.assertNotSubstituted(loaded);
      if (status === "CONFIRMED") {
        await assertOpenModuleSlot(tx, loaded.slot, assignmentId);
        await assertSlotEligibility(tx, loaded.slot, [loaded.personId, loaded.partnerPersonId].filter((id): id is string => Boolean(id)));
        await assertNoRosterDayConflict(tx, {
          churchId: pilot.churchId, serviceAt: loaded.slot.roster.serviceAt,
          personIds: [loaded.personId, loaded.partnerPersonId].filter((id): id is string => Boolean(id)),
          excludeAssignmentId: loaded.id, conflictCode: "ROSTER_SAME_DAY",
        });
      }
      const aggregate = await appendParticipantResponse(tx as never, loaded, actor.personId, status, now);
      const next = aggregate ?? status;
      const row = await tx.rosterAssignment.update({
        where: { id: loaded.id },
        data:
          next === "CONFIRMED"
            ? { status: next, confirmedAt: now, declinedAt: null }
            : next === "DECLINED"
              ? { status: next, declinedAt: now, confirmedAt: null }
              : { status: "PENDING", confirmedAt: null, declinedAt: null },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action:
            status === "CONFIRMED"
              ? "roster.assignment.confirm"
              : "roster.assignment.decline",
          resourceType: "roster_assignment",
          resourceId: loaded.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { notified: false, personId: actor.personId, response: aggregate ?? status },
        },
      });
      return row;
    });

    return {
      ...this.toAssignmentDto(updated),
      persisted: true,
      notified: false,
    };
  }

  private assertCanRespond(
    actor: AuthUser,
    assignment: AssignmentRow,
    pilot: Pilot,
  ): void {
    const own =
      Boolean(actor.personId) &&
      (actor.personId === assignment.personId ||
        actor.personId === assignment.partnerPersonId);
    if (own && assignment.slot?.roster.status !== "DRAFT") return;
    this.assertCanOperateMinistry(
      actor,
      assignment.slot?.roster.ministry ?? null,
      pilot,
      assignment.slot?.roster,
    );
  }

  private assertCanOperateMinistry(
    actor: AuthUser,
    ministry: MinistryRef | null,
    pilot: Pilot,
    roster?: { ministryId: string | null },
  ): void {
    const target = {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    };
    if (!ministry) {
      if (!canAdministerMinistries(actor.grants, target)) {
        throw new ForbiddenException({
          code: "MINISTRY_SCOPE_FORBIDDEN",
          message: "Escala sem ministério só pode ser operada pela secretaria, pastor ou administração.",
        });
      }
      return;
    }
    const allowed = canManageSpecificMinistry(actor.grants, actor.personId, {
      ...target,
      ministryId: ministry.id,
      leaderPersonId: ministry.leaderPersonId,
    });
    if (!allowed || (roster?.ministryId && roster.ministryId !== ministry.id)) {
      throw new ForbiddenException({
        code: "MINISTRY_SCOPE_FORBIDDEN",
        message: "Sem permissão neste ministério.",
      });
    }
  }

  private async requireMinistry(ministryId: string, pilot: Pilot, db: Pick<Prisma.TransactionClient, "ministry"> = this.prisma): Promise<MinistryRef> {
    const ministry = await db.ministry.findFirst({
      where: {
        id: ministryId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      select: { id: true, name: true, slug: true, leaderPersonId: true },
    });
    if (!ministry) {
      throw new NotFoundException("Ministério não encontrado");
    }
    return ministry;
  }

  private async requireSlot(
    slotId: string,
    pilot: Pilot,
    db: Pick<Prisma.TransactionClient, "rosterSlot"> = this.prisma,
  ): Promise<SlotRef> {
    const slot = await db.rosterSlot.findFirst({
      where: { id: slotId },
      include: { roster: { include: { ministry: true } } },
    });
    if (
      !slot ||
      slot.roster.organizationId !== pilot.organizationId ||
      slot.roster.churchId !== pilot.churchId
    ) {
      throw new NotFoundException("Slot de escala não encontrado");
    }
    return slot as SlotRef;
  }

  private async requireAssignment(
    assignmentId: string,
    pilot: Pilot,
    db: Pick<Prisma.TransactionClient, "rosterAssignment"> = this.prisma,
  ): Promise<AssignmentRow & { slot: SlotRef }> {
    const assignment = await db.rosterAssignment.findFirst({
      where: { id: assignmentId },
      include: { slot: { include: { roster: { include: { ministry: true } } } } },
    });
    if (
      !assignment ||
      assignment.slot.roster.organizationId !== pilot.organizationId ||
      assignment.slot.roster.churchId !== pilot.churchId
    ) {
      throw new NotFoundException("Atribuição não encontrada");
    }
    return assignment as AssignmentRow & { slot: SlotRef };
  }

  private async requirePerson(personId: string, organizationId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId },
      select: { id: true },
    });
    if (!person) {
      throw new BadRequestException("Pessoa não encontrada neste escopo");
    }
    return person;
  }

  private async assertCoupleException(
    pilot: Pilot,
    input: {
      personId: string;
      slotId: string;
      rosterId: string;
      ministryId: string | null;
      coupleExceptionId?: string;
    },
  ) {
    const matches = (ex: {
      slotId: string | null;
      rosterId: string | null;
      ministryId: string | null;
    }) => {
      if (ex.slotId && ex.slotId !== input.slotId) return false;
      if (ex.rosterId && ex.rosterId !== input.rosterId) return false;
      if (ex.ministryId && ex.ministryId !== input.ministryId) return false;
      return true;
    };

    if (input.coupleExceptionId?.trim()) {
      const named = await this.prisma.rosterCoupleException.findFirst({
        where: {
          id: input.coupleExceptionId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          personId: input.personId,
          status: "APPROVED",
        },
      });
      if (!named || !matches(named)) {
        throw new BadRequestException({
          code: "COUPLE_EXCEPTION_INVALID",
          message: "Exceção de casal inválida ou não aprovada para esta função.",
        });
      }
      return;
    }

    const approved = await this.prisma.rosterCoupleException.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        personId: input.personId,
        status: "APPROVED",
      },
      take: 50,
    });
    if (approved.some((ex) => matches(ex))) return;
    throw new BadRequestException({
      code: "COUPLE_REQUIRED",
      message: "Esta função exige casal ou uma exceção aprovada.",
    });
  }

  private async assertSchedulable(
    churchId: string,
    serviceAt: Date,
    personIds: string[],
  ) {
    for (const personId of personIds) {
      const windows = await this.prisma.volunteerAvailability.findMany({
        where: { churchId, personId, active: true },
        take: 50,
      });
      if (windows.length) {
        const weekday = serviceAt.getUTCDay();
        const minute = serviceAt.getUTCHours() * 60 + serviceAt.getUTCMinutes();
        const open = windows.some(
          (window) =>
            window.weekday === weekday &&
            minute >= window.startMinute &&
            minute < window.endMinute,
        );
        if (!open) {
          throw new ConflictException({
            code: "ROSTER_UNAVAILABLE",
            message: "Pessoa fora da disponibilidade cadastrada neste horário.",
          });
        }
      }
      const impediment = await this.prisma.volunteerImpediment.findFirst({
        where: {
          churchId,
          personId,
          startsAt: { lte: serviceAt },
          endsAt: { gt: serviceAt },
        },
        select: { id: true },
      });
      if (impediment) {
        throw new ConflictException({
          code: "ROSTER_IMPEDIMENT",
          message: "Pessoa possui impedimento neste horário.",
        });
      }
    }
  }

  private assertNotSubstituted(assignment: AssignmentRow) {
    if (assignment.status === "SUBSTITUTED") {
      throw new ConflictException({
        code: "ALREADY_SUBSTITUTED",
        message: "Esta atribuição já foi substituída.",
      });
    }
  }

  private async openInvites(personId: string, churchId: string) {
    const notices = (this.prisma as unknown as { rosterNotice?: { findMany?: (args: unknown) => Promise<Array<{ id: string; kind: string; title: string; body: string; expiresAt: Date | null; declinedAt: Date | null }>> } }).rosterNotice;
    if (!notices?.findMany) return [];
    const rows = await notices.findMany({
      where: { personId, churchId, kind: "substitute" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return rows.map(notice => ({
      assignmentId: notice.id.split(":")[1] ?? notice.id,
      title: notice.title,
      body: notice.body,
      expiresAt: notice.expiresAt,
      inviteStatus: notice.declinedAt ? "declined" : !notice.expiresAt || notice.expiresAt <= new Date() ? "expired" : "open",
    }));
  }

  private toMineDto(
    row: AssignmentRow & { slot: SlotRef },
    actorPersonId: string,
    dayCounts: Map<string, number>,
    history: Array<{ personId: string; status: string; createdAt: Date }> = [],
  ) {
    const key = churchDayKey(row.slot.roster.serviceAt);
    const roster = row.slot.roster as SlotRef["roster"] & {
      locationName?: string | null;
      arrivalContactName?: string | null;
      arrivalInstructions?: string | null;
      module?: { name?: string | null; locationName?: string | null; arrivalContactName?: string | null; arrivalInstructions?: string | null } | null;
    };
    const named = row as AssignmentRow & { person?: { displayName?: string | null } | null; partner?: { displayName?: string | null } | null };
    const companionName = row.partnerPersonId
      ? (row.personId === actorPersonId ? named.partner?.displayName : named.person?.displayName) ?? undefined
      : undefined;
    const responses = responseStatuses({
      actorId: actorPersonId, personId: row.personId, partnerPersonId: row.partnerPersonId,
      assignmentStatus: row.status, history,
    });
    return {
      id: row.id,
      status: row.status,
      participation:
        row.personId === actorPersonId ? ("assignee" as const) : ("partner" as const),
      roleLabel: row.slot.roleLabel,
      ...(row.slot.sector ? { sector: row.slot.sector } : {}),
      ...(row.slot.zone ? { zone: row.slot.zone } : {}),
      ...(row.slot.side ? { side: row.slot.side } : {}),
      rosterId: roster.id,
      title: roster.title,
      serviceAt: roster.serviceAt.toISOString(),
      ...(roster.module?.name ? { moduleName: roster.module.name } : {}),
      ...((roster.locationName ?? roster.module?.locationName) ? { locationName: roster.locationName ?? roster.module?.locationName } : {}),
      ...((roster.arrivalContactName ?? roster.module?.arrivalContactName) ? { arrivalContactName: roster.arrivalContactName ?? roster.module?.arrivalContactName } : {}),
      ...((roster.arrivalInstructions ?? roster.module?.arrivalInstructions) ? { arrivalInstructions: roster.arrivalInstructions ?? roster.module?.arrivalInstructions } : {}),
      ...(companionName ? { companionName } : {}),
      ...responses,
      rosterStatus: row.slot.roster.status,
      ministryId: row.slot.roster.ministryId,
      ministryName: row.slot.roster.ministry?.name ?? null,
      ministrySlug: row.slot.roster.ministry?.slug ?? null,
      partnerPersonId: row.partnerPersonId,
      substituteForId: row.substituteForId,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      declinedAt: row.declinedAt?.toISOString() ?? null,
      sameDayConflict: isActive(row.status) && (dayCounts.get(key) ?? 0) > 1,
    };
  }

  private toAssignmentDto(row: {
    id: string;
    slotId: string;
    personId: string;
    partnerPersonId: string | null;
    status: string;
    substituteForId: string | null;
    confirmedAt?: Date | null;
    declinedAt?: Date | null;
  }) {
    return {
      id: row.id,
      slotId: row.slotId,
      personId: row.personId,
      partnerPersonId: row.partnerPersonId,
      status: row.status,
      substituteForId: row.substituteForId ?? null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      declinedAt: row.declinedAt?.toISOString() ?? null,
    };
  }

  private assertRosterOpen(roster: { status: string }) {
    if (roster.status === "CLOSED") {
      throw new ConflictException({
        code: "ROSTER_CLOSED",
        message: "Escala fechada não aceita alteração.",
      });
    }
  }
}

function isActive(status: string): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

function requiredPersonId(value: string | undefined): string {
  const personId = value?.trim() ?? "";
  if (!personId) {
    throw new BadRequestException("personId é obrigatório");
  }
  return personId;
}

function optionalPersonId(value: string | undefined): string | null {
  const personId = value?.trim() ?? "";
  return personId.length > 0 ? personId : null;
}
