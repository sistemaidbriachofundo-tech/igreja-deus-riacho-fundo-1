import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  canAdministerMinistries,
  canLeadMinistry,
  canManageSpecificMinistry,
  ROLE_CODES,
  hasAccess,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import {
  ChannelsService,
  type RosterAlertKind,
} from "../channels/channels.service";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

export type LeadershipPublicEntry = {
  displayName: string;
  roleTitle: string;
};

export type MinistryProfileInput = {
  name?: string;
  slug?: string;
  leaderPersonId?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  galleryUrls?: string[];
  scheduleText?: string | null;
  leadershipPublic?: LeadershipPublicEntry[] | null;
  participationInfo?: string | null;
  visibility?: "PUBLIC" | "INTERNAL";
  publishStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

@Injectable()
export class MinistriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    @Optional() private readonly channels?: ChannelsService,
  ) {}

  async createMinistry(
    actor: AuthUser,
    input: { name: string; slug: string; leaderPersonId?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertAdminister(actor, pilot.organizationId, pilot.churchId);

    const name = input.name?.trim();
    const slug = input.slug?.trim().toLowerCase();
    if (!name || !slug) {
      throw new BadRequestException("name e slug são obrigatórios");
    }

    if (input.leaderPersonId) {
      await this.requirePerson(input.leaderPersonId, pilot.organizationId);
    }

    return this.prisma.$transaction(async (tx) => {
      const ministry = await tx.ministry.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name,
          slug,
          leaderPersonId: input.leaderPersonId ?? null,
          visibility: "INTERNAL",
          publishStatus: "DRAFT",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ministry.create",
          resourceType: "ministry",
          resourceId: ministry.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { name, slug },
        },
      });
      return this.toMinistryDto(ministry);
    });
  }

  async listMinistries(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const rows = await this.prisma.ministry.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { createdAt: "desc" },
    });

    const admin = canAdministerMinistries(actor.grants, {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    });
    const visible = admin
      ? rows
      : rows.filter((row) =>
          canManageSpecificMinistry(actor.grants, actor.personId, {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            ministryId: row.id,
            leaderPersonId: row.leaderPersonId,
          }),
        );

    return {
      churchId: pilot.churchId,
      ministries: visible.map((row) => this.toMinistryDto(row)),
    };
  }

  async getMinistry(actor: AuthUser, ministryId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const ministry = await this.requireMinistry(ministryId, pilot);
    this.assertManageMinistry(actor, ministry);
    return this.toMinistryDto(ministry);
  }

  async patchMinistry(
    actor: AuthUser,
    ministryId: string,
    input: MinistryProfileInput,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const existing = await this.requireMinistry(ministryId, pilot);
    this.assertManageMinistry(actor, existing);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new BadRequestException("name inválido");
      data.name = name;
    }
    if (input.slug !== undefined) {
      if (!canAdministerMinistries(actor.grants, pilot)) {
        throw new ForbiddenException("Só secretaria/pastor pode alterar slug");
      }
      const slug = input.slug?.trim().toLowerCase();
      if (!slug) throw new BadRequestException("slug inválido");
      data.slug = slug;
    }
    if (input.leaderPersonId !== undefined) {
      if (!canAdministerMinistries(actor.grants, pilot)) {
        throw new ForbiddenException(
          "Só secretaria/pastor pode alterar o líder titular",
        );
      }
      if (input.leaderPersonId) {
        await this.requirePerson(input.leaderPersonId, pilot.organizationId);
      }
      data.leaderPersonId = input.leaderPersonId;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.coverImageUrl !== undefined) {
      data.coverImageUrl = input.coverImageUrl;
    }
    if (input.galleryUrls !== undefined) {
      data.galleryUrls = sanitizeGallery(input.galleryUrls);
    }
    if (input.scheduleText !== undefined) data.scheduleText = input.scheduleText;
    if (input.leadershipPublic !== undefined) {
      data.leadershipPublic = sanitizeLeadership(input.leadershipPublic);
    }
    if (input.participationInfo !== undefined) {
      data.participationInfo = input.participationInfo;
    }
    if (input.visibility !== undefined) {
      if (!["PUBLIC", "INTERNAL"].includes(input.visibility)) {
        throw new BadRequestException("visibility inválida");
      }
      data.visibility = input.visibility;
    }
    if (input.publishStatus !== undefined) {
      this.applyPublishStatus(data, input.publishStatus, existing.publishStatus);
    }

    return this.prisma.$transaction(async (tx) => {
      const ministry = await tx.ministry.update({
        where: { id: ministryId },
        data,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ministry.patch",
          resourceType: "ministry",
          resourceId: ministryId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { fields: Object.keys(data) },
        },
      });
      return this.toMinistryDto(ministry);
    });
  }

  async publishMinistry(actor: AuthUser, ministryId: string) {
    return this.patchMinistry(actor, ministryId, {
      publishStatus: "PUBLISHED",
      visibility: "PUBLIC",
    });
  }

  async archiveMinistry(actor: AuthUser, ministryId: string) {
    return this.patchMinistry(actor, ministryId, {
      publishStatus: "ARCHIVED",
    });
  }

  async createRoster(
    actor: AuthUser,
    input: { title: string; serviceAt: string; ministryId?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();

    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException("title é obrigatório");
    }
    const serviceAt = new Date(input.serviceAt);
    if (Number.isNaN(serviceAt.getTime())) {
      throw new BadRequestException("serviceAt inválido");
    }

    if (input.ministryId) {
      const ministry = await this.requireMinistry(input.ministryId, pilot);
      this.assertManageMinistry(actor, ministry);
    } else {
      this.assertLead(actor, pilot.organizationId, pilot.churchId);
    }

    return this.prisma.$transaction(async (tx) => {
      const roster = await tx.roster.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: input.ministryId ?? null,
          title,
          serviceAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.create",
          resourceType: "roster",
          resourceId: roster.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { title, serviceAt: serviceAt.toISOString() },
        },
      });
      return this.toRosterDto(roster);
    });
  }

  async listRosters(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const rows = await this.prisma.roster.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { serviceAt: "desc" },
      include: {
        slots: {
          orderBy: { sortOrder: "asc" },
          include: { assignments: true },
        },
      },
    });

    return {
      churchId: pilot.churchId,
      rosters: rows.map((row) => ({
        ...this.toRosterDto(row),
        slots: row.slots.map((slot) => ({
          ...this.toSlotDto(slot),
          assignments: slot.assignments.map((a) => this.toAssignmentDto(a)),
        })),
      })),
    };
  }

  async publishRoster(actor: AuthUser, rosterId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const roster = await this.requireRoster(rosterId, pilot);

    if (roster.status !== "DRAFT") {
      throw new ConflictException({
        code: "ROSTER_NOT_DRAFT",
        message: "Só DRAFT pode ser publicado",
      });
    }

    const withSlots = await this.prisma.roster.findFirst({
      where: { id: rosterId },
      include: {
        slots: {
          include: {
            assignments: {
              where: { status: { in: ["PENDING", "CONFIRMED"] } },
            },
          },
        },
      },
    });
    if (!withSlots?.slots.length) {
      throw new BadRequestException({
        code: "ROSTER_EMPTY",
        message: "Publique apenas escalas com ao menos um slot",
      });
    }

    const personIds = new Set<string>();
    for (const slot of withSlots.slots) {
      for (const assignment of slot.assignments) {
        personIds.add(assignment.personId);
        if (assignment.partnerPersonId) {
          personIds.add(assignment.partnerPersonId);
        }
      }
    }

    // Conflitos com OUTRAS escalas no mesmo serviceAt (exclui esta roster).
    if (personIds.size) {
      await this.assertNoServiceConflict(
        pilot.churchId,
        roster.serviceAt,
        [...personIds],
        undefined,
        rosterId,
      );
    }

    // Pessoas duplicadas entre slots desta escala.
    const active = withSlots.slots.flatMap((s) => s.assignments);
    const seen = new Set<string>();
    for (const assignment of active) {
      for (const pid of [
        assignment.personId,
        assignment.partnerPersonId,
      ].filter(Boolean) as string[]) {
        if (seen.has(pid)) {
          throw new ConflictException({
            code: "ROSTER_INTERNAL_CONFLICT",
            message:
              "Pessoa aparece em mais de um slot PENDING/CONFIRMED desta escala",
          });
        }
        seen.add(pid);
      }
    }

    const dto = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.roster.update({
        where: { id: rosterId },
        data: { status: "PUBLISHED" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.publish",
          resourceType: "roster",
          resourceId: rosterId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            from: "DRAFT",
            to: "PUBLISHED",
            slotCount: withSlots.slots.length,
            activeAssignmentCount: withSlots.slots.reduce(
              (n, s) => n + s.assignments.length,
              0,
            ),
          },
        },
      });
      return this.toRosterDto(updated);
    });

    // RF-015: pedidos de confirmação via outbox mock (soft-fail).
    for (const slot of withSlots.slots) {
      for (const assignment of slot.assignments) {
        if (assignment.status !== "PENDING") continue;
        await this.softRosterAlert(actor, {
          assignmentId: assignment.id,
          kind: "confirm_request",
          personId: assignment.personId,
          rosterTitle: roster.title,
        });
      }
    }

    return dto;
  }

  async closeRoster(actor: AuthUser, rosterId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const roster = await this.requireRoster(rosterId, pilot);

    if (roster.status !== "PUBLISHED") {
      throw new ConflictException({
        code: "ROSTER_NOT_PUBLISHED",
        message: "Só PUBLISHED pode ser fechada",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.roster.update({
        where: { id: rosterId },
        data: { status: "CLOSED" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.close",
          resourceType: "roster",
          resourceId: rosterId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { from: "PUBLISHED", to: "CLOSED" },
        },
      });
      return this.toRosterDto(updated);
    });
  }

  async addSlot(
    actor: AuthUser,
    rosterId: string,
    input: {
      roleLabel: string;
      requiresCouple?: boolean;
      sortOrder?: number;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const roster = await this.requireRoster(rosterId, pilot);
    this.assertRosterDraft(roster);

    const roleLabel = input.roleLabel?.trim();
    if (!roleLabel) {
      throw new BadRequestException("roleLabel é obrigatório");
    }

    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.rosterSlot.create({
        data: {
          rosterId,
          roleLabel,
          requiresCouple: Boolean(input.requiresCouple),
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.slot.create",
          resourceType: "roster_slot",
          resourceId: slot.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { rosterId, roleLabel },
        },
      });
      return this.toSlotDto(slot);
    });
  }

  async addAssignment(
    actor: AuthUser,
    slotId: string,
    input: {
      personId: string;
      partnerPersonId?: string;
      coupleExceptionId?: string;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const slot = await this.prisma.rosterSlot.findFirst({
      where: { id: slotId },
      include: {
        roster: true,
      },
    });
    if (
      !slot ||
      slot.roster.organizationId !== pilot.organizationId ||
      slot.roster.churchId !== pilot.churchId
    ) {
      throw new NotFoundException("Slot de escala não encontrado");
    }
    // PUBLISHED ainda aceita designações; CLOSED trava.
    this.assertRosterNotClosed(slot.roster);

    if (!input.personId?.trim()) {
      throw new BadRequestException("personId é obrigatório");
    }
    await this.requirePerson(input.personId, pilot.organizationId);

    const personIds = [
      input.personId,
      input.partnerPersonId,
    ].filter(Boolean) as string[];

    if (slot.requiresCouple && !input.partnerPersonId?.trim()) {
      await this.assertCoupleExceptionAllowsSolo(
        pilot,
        {
          personId: input.personId,
          slotId,
          rosterId: slot.rosterId,
          ministryId: slot.roster.ministryId,
          coupleExceptionId: input.coupleExceptionId,
        },
      );
    }

    if (input.partnerPersonId) {
      await this.requirePerson(input.partnerPersonId, pilot.organizationId);
    }

    await this.assertPersonsSchedulable(
      pilot.churchId,
      slot.roster.serviceAt,
      personIds,
    );

    await this.assertNoServiceConflict(
      pilot.churchId,
      slot.roster.serviceAt,
      personIds,
    );

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.rosterAssignment.create({
        data: {
          slotId,
          personId: input.personId,
          partnerPersonId: input.partnerPersonId ?? null,
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
            slotId,
            personId: input.personId,
            partnerPersonId: input.partnerPersonId ?? null,
            coupleExceptionId: input.coupleExceptionId ?? null,
          },
        },
      });
      return this.toAssignmentDto(assignment);
    });
  }

  async confirmAssignment(actor: AuthUser, assignmentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const loaded = await this.requireAssignmentInChurch(assignmentId, pilot);
    this.assertRosterNotClosed(loaded.roster);
    this.assertCanRespondOwnOrLead(actor, loaded.assignment.personId, pilot);

    await this.assertNoServiceConflict(
      pilot.churchId,
      loaded.roster.serviceAt,
      [
        loaded.assignment.personId,
        loaded.assignment.partnerPersonId,
      ].filter(Boolean) as string[],
      assignmentId,
    );

    const dto = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.rosterAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          declinedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.assignment.confirm",
          resourceType: "roster_assignment",
          resourceId: assignmentId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {},
        },
      });
      return this.toAssignmentDto(updated);
    });
    await this.softRosterAlert(actor, {
      assignmentId,
      kind: "confirm",
      personId: loaded.assignment.personId,
      rosterTitle: loaded.roster.title,
    });
    return dto;
  }

  async declineAssignment(actor: AuthUser, assignmentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const loaded = await this.requireAssignmentInChurch(assignmentId, pilot);
    this.assertRosterNotClosed(loaded.roster);
    this.assertCanRespondOwnOrLead(actor, loaded.assignment.personId, pilot);

    const dto = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.rosterAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "DECLINED",
          declinedAt: new Date(),
          confirmedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.assignment.decline",
          resourceType: "roster_assignment",
          resourceId: assignmentId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {},
        },
      });
      return this.toAssignmentDto(updated);
    });
    await this.softRosterAlert(actor, {
      assignmentId,
      kind: "decline",
      personId: loaded.assignment.personId,
      rosterTitle: loaded.roster.title,
    });
    return dto;
  }

  async substituteAssignment(
    actor: AuthUser,
    assignmentId: string,
    input: {
      personId: string;
      partnerPersonId?: string;
      coupleExceptionId?: string;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const loaded = await this.requireAssignmentInChurch(assignmentId, pilot);
    this.assertRosterNotClosed(loaded.roster);

    if (!input.personId?.trim()) {
      throw new BadRequestException("personId é obrigatório");
    }
    await this.requirePerson(input.personId, pilot.organizationId);

    const personIds = [
      input.personId,
      input.partnerPersonId,
    ].filter(Boolean) as string[];

    if (loaded.slot.requiresCouple && !input.partnerPersonId?.trim()) {
      await this.assertCoupleExceptionAllowsSolo(pilot, {
        personId: input.personId,
        slotId: loaded.slot.id,
        rosterId: loaded.roster.id,
        ministryId: loaded.roster.ministryId,
        coupleExceptionId: input.coupleExceptionId,
      });
    }
    if (input.partnerPersonId) {
      await this.requirePerson(input.partnerPersonId, pilot.organizationId);
    }

    await this.assertPersonsSchedulable(
      pilot.churchId,
      loaded.roster.serviceAt,
      personIds,
    );

    await this.assertNoServiceConflict(
      pilot.churchId,
      loaded.roster.serviceAt,
      personIds,
      assignmentId,
    );

    const dto = await this.prisma.$transaction(async (tx) => {
      await tx.rosterAssignment.update({
        where: { id: assignmentId },
        data: { status: "SUBSTITUTED" },
      });
      const substitute = await tx.rosterAssignment.create({
        data: {
          slotId: loaded.assignment.slotId,
          personId: input.personId,
          partnerPersonId: input.partnerPersonId ?? null,
          status: "PENDING",
          substituteForId: assignmentId,
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
            replacedAssignmentId: assignmentId,
            personId: input.personId,
            coupleExceptionId: input.coupleExceptionId ?? null,
          },
        },
      });
      return this.toAssignmentDto(substitute);
    });
    await this.softRosterAlert(actor, {
      assignmentId: dto.id,
      kind: "substitute",
      personId: input.personId,
      rosterTitle: loaded.roster.title,
    });
    return dto;
  }

  async resendAssignmentAlert(
    actor: AuthUser,
    assignmentId: string,
    kind: RosterAlertKind,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const loaded = await this.requireAssignmentInChurch(assignmentId, pilot);
    if (!this.channels) {
      return { notified: 0, outbox: [], reused: false };
    }
    return this.channels.enqueueRosterAlert({
      actor,
      assignmentId,
      kind,
      personId: loaded.assignment.personId,
      rosterTitle: loaded.roster.title,
    });
  }

  // —— RF-014 disponibilidade / impedimentos ——

  async createAvailability(
    actor: AuthUser,
    input: {
      personId: string;
      weekday: number;
      startMinute: number;
      endMinute: number;
      notes?: string | null;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    await this.requirePerson(input.personId, pilot.organizationId);
    this.assertWeekday(input.weekday);
    this.assertMinuteWindow(input.startMinute, input.endMinute);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.volunteerAvailability.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          personId: input.personId,
          weekday: input.weekday,
          startMinute: input.startMinute,
          endMinute: input.endMinute,
          notes: input.notes?.trim() || null,
          active: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.availability.create",
          resourceType: "volunteer_availability",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { personId: input.personId, weekday: input.weekday },
        },
      });
      return this.toAvailabilityDto(row);
    });
  }

  async listAvailability(actor: AuthUser, personId?: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const rows = await this.prisma.volunteerAvailability.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(personId ? { personId } : {}),
      },
      orderBy: [{ personId: "asc" }, { weekday: "asc" }, { startMinute: "asc" }],
      take: 200,
    });
    return {
      churchId: pilot.churchId,
      availabilities: rows.map((r) => this.toAvailabilityDto(r)),
    };
  }

  async deactivateAvailability(actor: AuthUser, availabilityId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const row = await this.prisma.volunteerAvailability.findFirst({
      where: {
        id: availabilityId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Disponibilidade não encontrada");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.volunteerAvailability.update({
        where: { id: availabilityId },
        data: { active: false },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.availability.deactivate",
          resourceType: "volunteer_availability",
          resourceId: availabilityId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {},
        },
      });
      return this.toAvailabilityDto(updated);
    });
  }

  async createImpediment(
    actor: AuthUser,
    input: {
      personId: string;
      startsAt: string;
      endsAt: string;
      reason?: string | null;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    await this.requirePerson(input.personId, pilot.organizationId);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException("startsAt/endsAt inválidos");
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException("endsAt deve ser após startsAt");
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.volunteerImpediment.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          personId: input.personId,
          startsAt,
          endsAt,
          reason: input.reason?.trim() || null,
          createdByUserId: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.impediment.create",
          resourceType: "volunteer_impediment",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { personId: input.personId },
        },
      });
      return this.toImpedimentDto(row);
    });
  }

  async listImpediments(actor: AuthUser, personId?: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const rows = await this.prisma.volunteerImpediment.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(personId ? { personId } : {}),
      },
      orderBy: { startsAt: "asc" },
      take: 200,
    });
    return {
      churchId: pilot.churchId,
      impediments: rows.map((r) => this.toImpedimentDto(r)),
    };
  }

  async deleteImpediment(actor: AuthUser, impedimentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const row = await this.prisma.volunteerImpediment.findFirst({
      where: {
        id: impedimentId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Impedimento não encontrado");

    await this.prisma.$transaction(async (tx) => {
      await tx.volunteerImpediment.delete({ where: { id: impedimentId } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "roster.impediment.delete",
          resourceType: "volunteer_impediment",
          resourceId: impedimentId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { personId: row.personId },
        },
      });
    });
    return { deleted: true, id: impedimentId };
  }

  // —— RF-014 exceções de casal ——

  async simulateCoupleException(
    actor: AuthUser,
    input: {
      personId: string;
      reason: string;
      slotId?: string;
      rosterId?: string;
      ministryId?: string;
      notes?: string | null;
    },
  ) {
    return this.createCoupleException(actor, {
      ...input,
      simulation: true,
      approveNow: false,
    });
  }

  async configureCoupleException(
    actor: AuthUser,
    input: {
      personId: string;
      reason: string;
      slotId?: string;
      rosterId?: string;
      ministryId?: string;
      notes?: string | null;
      approveNow?: boolean;
    },
  ) {
    return this.createCoupleException(actor, {
      ...input,
      simulation: false,
      approveNow: input.approveNow ?? true,
    });
  }

  async listCoupleExceptions(
    actor: AuthUser,
    query: { status?: string; personId?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const rows = await this.prisma.rosterCoupleException.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(query.personId ? { personId: query.personId } : {}),
        ...(query.status
          ? { status: query.status as never }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return {
      churchId: pilot.churchId,
      exceptions: rows.map((r) => this.toCoupleExceptionDto(r)),
    };
  }

  async approveCoupleException(actor: AuthUser, exceptionId: string) {
    return this.reviewCoupleException(actor, exceptionId, "APPROVED");
  }

  async rejectCoupleException(actor: AuthUser, exceptionId: string) {
    return this.reviewCoupleException(actor, exceptionId, "REJECTED");
  }

  private async createCoupleException(
    actor: AuthUser,
    input: {
      personId: string;
      reason: string;
      slotId?: string;
      rosterId?: string;
      ministryId?: string;
      notes?: string | null;
      simulation: boolean;
      approveNow: boolean;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    await this.requirePerson(input.personId, pilot.organizationId);
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException("reason é obrigatório");

    if (input.slotId) {
      const slot = await this.prisma.rosterSlot.findFirst({
        where: { id: input.slotId },
        include: { roster: true },
      });
      if (
        !slot ||
        slot.roster.organizationId !== pilot.organizationId ||
        slot.roster.churchId !== pilot.churchId
      ) {
        throw new NotFoundException("Slot não encontrado");
      }
    }
    if (input.rosterId) {
      await this.requireRoster(input.rosterId, pilot);
    }
    if (input.ministryId) {
      await this.requireMinistry(input.ministryId, pilot);
    }

    const status = input.approveNow ? "APPROVED" : "PENDING";
    const now = input.approveNow ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.rosterCoupleException.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: input.ministryId ?? null,
          rosterId: input.rosterId ?? null,
          slotId: input.slotId ?? null,
          personId: input.personId,
          reason,
          status,
          simulation: input.simulation,
          requestedByUserId: actor.userId,
          reviewedByUserId: input.approveNow ? actor.userId : null,
          reviewedAt: now,
          notes: input.notes?.trim() || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: input.simulation
            ? "roster.couple_exception.simulate"
            : "roster.couple_exception.configure",
          resourceType: "roster_couple_exception",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { status, personId: input.personId },
        },
      });
      return this.toCoupleExceptionDto(row);
    });
  }

  private async reviewCoupleException(
    actor: AuthUser,
    exceptionId: string,
    status: "APPROVED" | "REJECTED",
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const row = await this.prisma.rosterCoupleException.findFirst({
      where: {
        id: exceptionId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Exceção de casal não encontrada");
    if (row.status !== "PENDING") {
      throw new ConflictException({
        code: "COUPLE_EXCEPTION_NOT_PENDING",
        message: "Só PENDING pode ser aprovada/rejeitada",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rosterCoupleException.update({
        where: { id: exceptionId },
        data: {
          status,
          reviewedByUserId: actor.userId,
          reviewedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action:
            status === "APPROVED"
              ? "roster.couple_exception.approve"
              : "roster.couple_exception.reject",
          resourceType: "roster_couple_exception",
          resourceId: exceptionId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { from: "PENDING", to: status },
        },
      });
      return this.toCoupleExceptionDto(updated);
    });
  }

  private async assertCoupleExceptionAllowsSolo(
    pilot: { organizationId: string; churchId: string },
    input: {
      personId: string;
      slotId: string;
      rosterId: string;
      ministryId: string | null;
      coupleExceptionId?: string;
    },
  ): Promise<void> {
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
      if (!named || !this.coupleExceptionMatchesScope(named, input)) {
        throw new BadRequestException({
          code: "COUPLE_EXCEPTION_INVALID",
          message:
            "coupleExceptionId inválido/não aprovado para este person/slot",
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
    if (approved.some((ex) => this.coupleExceptionMatchesScope(ex, input))) {
      return;
    }

    throw new BadRequestException({
      code: "COUPLE_REQUIRED",
      message:
        "Este slot exige casal (partnerPersonId) ou exceção APPROVED (simule/configure)",
    });
  }

  private coupleExceptionMatchesScope(
    ex: {
      slotId: string | null;
      rosterId: string | null;
      ministryId: string | null;
    },
    scope: {
      slotId: string;
      rosterId: string;
      ministryId: string | null;
    },
  ): boolean {
    if (ex.slotId && ex.slotId !== scope.slotId) return false;
    if (ex.rosterId && ex.rosterId !== scope.rosterId) return false;
    if (ex.ministryId && ex.ministryId !== scope.ministryId) return false;
    return true;
  }

  private async assertPersonsSchedulable(
    churchId: string,
    serviceAt: Date,
    personIds: string[],
  ): Promise<void> {
    for (const personId of personIds) {
      await this.assertPersonAvailable(churchId, personId, serviceAt);
      await this.assertNoImpediment(churchId, personId, serviceAt);
    }
  }

  private async assertPersonAvailable(
    churchId: string,
    personId: string,
    serviceAt: Date,
  ): Promise<void> {
    const windows = await this.prisma.volunteerAvailability.findMany({
      where: { churchId, personId, active: true },
      take: 50,
    });
    // Sem janelas cadastradas = disponível por padrão.
    if (!windows.length) return;

    const weekday = serviceAt.getUTCDay();
    const minute =
      serviceAt.getUTCHours() * 60 + serviceAt.getUTCMinutes();
    const ok = windows.some(
      (w) =>
        w.weekday === weekday &&
        minute >= w.startMinute &&
        minute < w.endMinute,
    );
    if (!ok) {
      throw new ConflictException({
        code: "ROSTER_UNAVAILABLE",
        message:
          "Pessoa fora das janelas de disponibilidade para este serviceAt",
      });
    }
  }

  private async assertNoImpediment(
    churchId: string,
    personId: string,
    serviceAt: Date,
  ): Promise<void> {
    const hit = await this.prisma.volunteerImpediment.findFirst({
      where: {
        churchId,
        personId,
        startsAt: { lte: serviceAt },
        endsAt: { gt: serviceAt },
      },
      select: { id: true },
    });
    if (hit) {
      throw new ConflictException({
        code: "ROSTER_IMPEDIMENT",
        message: "Pessoa possui impedimento no horário do serviceAt",
      });
    }
  }

  private async softRosterAlert(
    actor: AuthUser,
    params: {
      assignmentId: string;
      kind: RosterAlertKind;
      personId: string;
      rosterTitle?: string | null;
    },
  ): Promise<void> {
    if (!this.channels) return;
    try {
      await this.channels.enqueueRosterAlert({
        actor,
        ...params,
      });
    } catch {
      // Soft-fail: escala não depende do canal.
    }
  }

  private assertWeekday(weekday: number): void {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new BadRequestException("weekday deve ser 0–6 (UTC)");
    }
  }

  private assertMinuteWindow(startMinute: number, endMinute: number): void {
    if (
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute) ||
      startMinute < 0 ||
      endMinute > 1440 ||
      endMinute <= startMinute
    ) {
      throw new BadRequestException(
        "startMinute/endMinute inválidos (0–1440, end > start)",
      );
    }
  }

  private toAvailabilityDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    personId: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
    notes: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      personId: row.personId,
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      notes: row.notes,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toImpedimentDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    personId: string;
    startsAt: Date;
    endsAt: Date;
    reason: string | null;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      personId: row.personId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      reason: row.reason,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCoupleExceptionDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    ministryId: string | null;
    rosterId: string | null;
    slotId: string | null;
    personId: string;
    reason: string;
    status: string;
    simulation: boolean;
    requestedByUserId: string;
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      ministryId: row.ministryId,
      rosterId: row.rosterId,
      slotId: row.slotId,
      personId: row.personId,
      reason: row.reason,
      status: row.status,
      simulation: row.simulation,
      requestedByUserId: row.requestedByUserId,
      reviewedByUserId: row.reviewedByUserId,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertLead(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    if (!canLeadMinistry(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException(
        "Sem permissão de liderança nesta congregação",
      );
    }
  }

  private assertAdminister(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    if (!canAdministerMinistries(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException(
        "Sem permissão administrativa de ministérios nesta congregação",
      );
    }
  }

  private assertManageMinistry(
    actor: AuthUser,
    ministry: {
      id: string;
      organizationId: string;
      churchId: string;
      leaderPersonId: string | null;
    },
  ): void {
    if (
      !canManageSpecificMinistry(actor.grants, actor.personId, {
        organizationId: ministry.organizationId,
        churchId: ministry.churchId,
        ministryId: ministry.id,
        leaderPersonId: ministry.leaderPersonId,
      })
    ) {
      throw new ForbiddenException(
        "Sem permissão neste ministério (líder só opera o próprio)",
      );
    }
  }

  private applyPublishStatus(
    data: Record<string, unknown>,
    next: "DRAFT" | "PUBLISHED" | "ARCHIVED",
    current: string,
  ): void {
    if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(next)) {
      throw new BadRequestException("publishStatus inválido");
    }
    data.publishStatus = next;
    if (next === "PUBLISHED" && current !== "PUBLISHED") {
      data.publishedAt = new Date();
    }
    if (next === "DRAFT") {
      data.publishedAt = null;
    }
  }

  private async requireMinistry(
    ministryId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const ministry = await this.prisma.ministry.findFirst({
      where: {
        id: ministryId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!ministry) {
      throw new NotFoundException("Ministério não encontrado");
    }
    return ministry;
  }

  private assertCanRespondOwnOrLead(
    actor: AuthUser,
    assignmentPersonId: string,
    pilot: { organizationId: string; churchId: string },
  ): void {
    if (
      canLeadMinistry(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      return;
    }
    const isOwn =
      actor.personId === assignmentPersonId &&
      hasAccess(actor.grants, {
        roleCodes: [ROLE_CODES.MEMBRO],
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      });
    if (!isOwn) {
      throw new ForbiddenException(
        "Sem permissão para responder esta escala",
      );
    }
  }

  private assertRosterDraft(roster: { status?: string }): void {
    const status = roster.status ?? "DRAFT";
    if (status !== "DRAFT") {
      throw new ConflictException({
        code: "ROSTER_NOT_DRAFT",
        message: "Slots/assignments só podem ser criados em DRAFT",
      });
    }
  }

  private assertRosterNotClosed(roster: { status?: string }): void {
    if ((roster.status ?? "DRAFT") === "CLOSED") {
      throw new ConflictException({
        code: "ROSTER_CLOSED",
        message: "Escala CLOSED não aceita alterações de assignment",
      });
    }
  }

  private async assertNoServiceConflict(
    churchId: string,
    serviceAt: Date,
    personIds: string[],
    excludeAssignmentId?: string,
    excludeRosterId?: string,
  ): Promise<void> {
    if (!personIds.length) return;

    const conflicts = await this.prisma.rosterAssignment.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        ...(excludeAssignmentId
          ? { id: { not: excludeAssignmentId } }
          : {}),
        OR: [
          { personId: { in: personIds } },
          { partnerPersonId: { in: personIds } },
        ],
        slot: {
          roster: {
            churchId,
            serviceAt,
            ...(excludeRosterId ? { id: { not: excludeRosterId } } : {}),
          },
        },
      },
      select: { id: true, personId: true },
      take: 1,
    });

    if (conflicts.length) {
      throw new ConflictException({
        code: "ROSTER_SERVICE_CONFLICT",
        message:
          "Pessoa já possui escala PENDING/CONFIRMED no mesmo serviceAt desta congregação",
      });
    }
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

  private async requireRoster(
    rosterId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const roster = await this.prisma.roster.findFirst({
      where: {
        id: rosterId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!roster) {
      throw new NotFoundException("Escala não encontrada");
    }
    return roster;
  }

  private async requireAssignmentInChurch(
    assignmentId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const assignment = await this.prisma.rosterAssignment.findFirst({
      where: { id: assignmentId },
      include: {
        slot: {
          include: { roster: true },
        },
      },
    });
    if (
      !assignment ||
      assignment.slot.roster.organizationId !== pilot.organizationId ||
      assignment.slot.roster.churchId !== pilot.churchId
    ) {
      throw new NotFoundException("Atribuição de escala não encontrada");
    }
    return {
      assignment,
      slot: assignment.slot,
      roster: assignment.slot.roster,
    };
  }

  private toMinistryDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    name: string;
    slug: string;
    leaderPersonId: string | null;
    description?: string | null;
    coverImageUrl?: string | null;
    galleryUrls?: string[];
    scheduleText?: string | null;
    leadershipPublic?: unknown;
    participationInfo?: string | null;
    visibility?: string;
    publishStatus?: string;
    publishedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      name: row.name,
      slug: row.slug,
      leaderPersonId: row.leaderPersonId,
      description: row.description ?? null,
      coverImageUrl: row.coverImageUrl ?? null,
      galleryUrls: row.galleryUrls ?? [],
      scheduleText: row.scheduleText ?? null,
      leadershipPublic: sanitizeLeadership(
        (row.leadershipPublic as LeadershipPublicEntry[] | null) ?? null,
      ),
      participationInfo: row.participationInfo ?? null,
      visibility: row.visibility ?? "INTERNAL",
      publishStatus: row.publishStatus ?? "DRAFT",
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRosterDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    ministryId: string | null;
    title: string;
    serviceAt: Date;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      ministryId: row.ministryId,
      title: row.title,
      serviceAt: row.serviceAt.toISOString(),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toSlotDto(slot: {
    id: string;
    rosterId: string;
    roleLabel: string;
    requiresCouple: boolean;
    sortOrder: number;
  }) {
    return {
      id: slot.id,
      rosterId: slot.rosterId,
      roleLabel: slot.roleLabel,
      requiresCouple: slot.requiresCouple,
      sortOrder: slot.sortOrder,
    };
  }

  private toAssignmentDto(row: {
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
  }) {
    return {
      id: row.id,
      slotId: row.slotId,
      personId: row.personId,
      partnerPersonId: row.partnerPersonId,
      status: row.status,
      substituteForId: row.substituteForId,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      declinedAt: row.declinedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function sanitizeGallery(urls: string[] | undefined): string[] {
  if (!urls) return [];
  return urls
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean)
    .slice(0, 24);
}

function sanitizeLeadership(
  entries: LeadershipPublicEntry[] | null | undefined,
): LeadershipPublicEntry[] {
  if (!entries?.length) return [];
  return entries
    .map((e) => ({
      displayName: String(e?.displayName ?? "").trim(),
      roleTitle: String(e?.roleTitle ?? "").trim(),
    }))
    .filter((e) => e.displayName && e.roleTitle)
    .slice(0, 20);
}
