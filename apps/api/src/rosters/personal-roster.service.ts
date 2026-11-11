import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  canAdministerMinistries,
  canManageSpecificMinistry,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { churchDayBounds, churchDayKey } from "./church-day";

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
  title: string;
  serviceAt: Date;
  status: string;
  ministry: MinistryRef | null;
};

type SlotRef = {
  id: string;
  roleLabel: string;
  requiresCouple: boolean;
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
          },
        },
      },
      include: {
        slot: {
          include: {
            roster: { include: { ministry: true } },
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

    const assignments = mine.flatMap((row) => {
      if (!row.slot) return [];
      return [this.toMineDto(row as AssignmentRow & { slot: SlotRef }, actor.personId, counts)];
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
    };
  }

  async listMinistry(actor: AuthUser, ministryId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const ministry = await this.requireMinistry(ministryId, pilot);
    this.assertCanOperateMinistry(actor, ministry, pilot);

    const rows = await this.prisma.roster.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ministryId: ministry.id,
      },
      orderBy: { serviceAt: "asc" },
      include: {
        slots: {
          orderBy: { sortOrder: "asc" },
          include: {
            assignments: { include: { person: { select: { displayName: true } }, partner: { select: { displayName: true } } } },
          },
        },
      },
    });

    return {
      ministryId: ministry.id,
      notified: false,
      rosters: rows.map((row) => ({
        id: row.id,
        ministryId: row.ministryId,
        title: row.title,
        serviceAt: row.serviceAt.toISOString(),
        status: row.status,
        slots: row.slots.map((slot) => ({
          id: slot.id,
          roleLabel: slot.roleLabel,
          requiresCouple: slot.requiresCouple,
          sortOrder: slot.sortOrder,
          assignments: slot.assignments.map(assignment => ({
            ...this.toAssignmentDto(assignment),
            personName: assignment.person?.displayName ?? null,
            partnerName: assignment.partner?.displayName ?? null,
          })),
        })),
      })),
    };
  }

  async assign(
    actor: AuthUser,
    slotId: string,
    input: {
      personId: string;
      partnerPersonId?: string;
      coupleExceptionId?: string;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const slot = await this.requireSlot(slotId, pilot);
    this.assertCanOperateMinistry(actor, slot.roster.ministry, pilot, slot.roster);
    this.assertRosterOpen(slot.roster);

    const personId = requiredPersonId(input.personId);
    const partnerPersonId = optionalPersonId(input.partnerPersonId);
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
    await this.assertNoSameDay(pilot.churchId, slot.roster.serviceAt, personIds);

    const created = await this.prisma.$transaction(async (tx) => {
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
    this.assertRosterOpen(loaded.slot.roster);
    if (loaded.status === "SUBSTITUTED") {
      throw new ConflictException({
        code: "ALREADY_SUBSTITUTED",
        message: "Esta atribuição já foi substituída.",
      });
    }

    const personId = requiredPersonId(input.personId);
    const partnerPersonId = optionalPersonId(input.partnerPersonId);
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
    await this.assertNoSameDay(
      pilot.churchId,
      loaded.slot.roster.serviceAt,
      personIds,
      loaded.id,
    );

    const created = await this.prisma.$transaction(async (tx) => {
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
    const loaded = await this.requireAssignment(assignmentId, pilot);
    this.assertCanRespond(actor, loaded, pilot);
    this.assertRosterOpen(loaded.slot.roster);
    if (loaded.status === "SUBSTITUTED") {
      throw new ConflictException({
        code: "ALREADY_SUBSTITUTED",
        message: "Atribuição substituída não aceita confirmação.",
      });
    }

    if (status === "CONFIRMED") {
      const people = [loaded.personId, loaded.partnerPersonId].filter(
        (id): id is string => Boolean(id),
      );
      await this.assertNoSameDay(
        pilot.churchId,
        loaded.slot.roster.serviceAt,
        people,
        loaded.id,
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.rosterAssignment.update({
        where: { id: loaded.id },
        data:
          status === "CONFIRMED"
            ? { status, confirmedAt: now, declinedAt: null }
            : { status, declinedAt: now, confirmedAt: null },
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
          metadata: { notified: false },
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
    if (own) return;
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

  private async requireMinistry(ministryId: string, pilot: Pilot): Promise<MinistryRef> {
    const ministry = await this.prisma.ministry.findFirst({
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

  private async requireSlot(slotId: string, pilot: Pilot): Promise<SlotRef> {
    const slot = await this.prisma.rosterSlot.findFirst({
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
  ): Promise<AssignmentRow & { slot: SlotRef }> {
    const assignment = await this.prisma.rosterAssignment.findFirst({
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

  private async assertNoSameDay(
    churchId: string,
    serviceAt: Date,
    personIds: string[],
    excludeAssignmentId?: string,
  ) {
    if (!personIds.length) return;
    const { start, end } = churchDayBounds(serviceAt);
    const conflicts = await this.prisma.rosterAssignment.findMany({
      where: {
        status: { in: [...ACTIVE] },
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        OR: [
          { personId: { in: personIds } },
          { partnerPersonId: { in: personIds } },
        ],
        slot: {
          roster: {
            churchId,
            serviceAt: { gte: start, lt: end },
          },
        },
      },
      select: { id: true },
      take: 1,
    });
    if (conflicts.length) {
      throw new ConflictException({
        code: "ROSTER_SAME_DAY",
        message:
          "Esta pessoa já tem posição ativa no mesmo dia nesta congregação.",
      });
    }
  }

  private toMineDto(
    row: AssignmentRow & { slot: SlotRef },
    actorPersonId: string,
    dayCounts: Map<string, number>,
  ) {
    const key = churchDayKey(row.slot.roster.serviceAt);
    return {
      id: row.id,
      status: row.status,
      participation:
        row.personId === actorPersonId ? ("assignee" as const) : ("partner" as const),
      roleLabel: row.slot.roleLabel,
      rosterId: row.slot.roster.id,
      title: row.slot.roster.title,
      serviceAt: row.slot.roster.serviceAt.toISOString(),
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
