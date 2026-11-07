import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  canAdministerMinistries,
  canLeadMinistry,
  canManageSpecificMinistry,
  ROLE_CODES,
  hasAccess,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
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

    return this.prisma.$transaction(async (tx) => {
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
    input: { personId: string; partnerPersonId?: string },
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

    if (slot.requiresCouple && !input.partnerPersonId?.trim()) {
      throw new BadRequestException(
        "Este slot exige casal (partnerPersonId obrigatório)",
      );
    }

    if (input.partnerPersonId) {
      await this.requirePerson(input.partnerPersonId, pilot.organizationId);
    }

    await this.assertNoServiceConflict(
      pilot.churchId,
      slot.roster.serviceAt,
      [input.personId, input.partnerPersonId].filter(Boolean) as string[],
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

    return this.prisma.$transaction(async (tx) => {
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
  }

  async declineAssignment(actor: AuthUser, assignmentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const loaded = await this.requireAssignmentInChurch(assignmentId, pilot);
    this.assertRosterNotClosed(loaded.roster);
    this.assertCanRespondOwnOrLead(actor, loaded.assignment.personId, pilot);

    return this.prisma.$transaction(async (tx) => {
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
  }

  async substituteAssignment(
    actor: AuthUser,
    assignmentId: string,
    input: { personId: string; partnerPersonId?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const loaded = await this.requireAssignmentInChurch(assignmentId, pilot);
    this.assertRosterNotClosed(loaded.roster);

    if (!input.personId?.trim()) {
      throw new BadRequestException("personId é obrigatório");
    }
    await this.requirePerson(input.personId, pilot.organizationId);

    if (loaded.slot.requiresCouple && !input.partnerPersonId?.trim()) {
      throw new BadRequestException(
        "Este slot exige casal (partnerPersonId obrigatório)",
      );
    }
    if (input.partnerPersonId) {
      await this.requirePerson(input.partnerPersonId, pilot.organizationId);
    }

    await this.assertNoServiceConflict(
      pilot.churchId,
      loaded.roster.serviceAt,
      [input.personId, input.partnerPersonId].filter(Boolean) as string[],
      assignmentId,
    );

    return this.prisma.$transaction(async (tx) => {
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
          },
        },
      });
      return this.toAssignmentDto(substitute);
    });
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
