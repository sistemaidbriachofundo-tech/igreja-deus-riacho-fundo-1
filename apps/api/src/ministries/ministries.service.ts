import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canLeadMinistry, ROLE_CODES, hasAccess } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

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
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

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

    return {
      churchId: pilot.churchId,
      ministries: rows.map((row) => this.toMinistryDto(row)),
    };
  }

  async createRoster(
    actor: AuthUser,
    input: { title: string; serviceAt: string; ministryId?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException("title é obrigatório");
    }
    const serviceAt = new Date(input.serviceAt);
    if (Number.isNaN(serviceAt.getTime())) {
      throw new BadRequestException("serviceAt inválido");
    }

    if (input.ministryId) {
      const ministry = await this.prisma.ministry.findFirst({
        where: {
          id: input.ministryId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });
      if (!ministry) {
        throw new BadRequestException("Ministério não encontrado neste escopo");
      }
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
    await this.requireRoster(rosterId, pilot);

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

  private async assertNoServiceConflict(
    churchId: string,
    serviceAt: Date,
    personIds: string[],
    excludeAssignmentId?: string,
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
          },
        },
      },
      select: { id: true, personId: true },
      take: 1,
    });

    if (conflicts.length) {
      throw new ConflictException(
        "Pessoa já possui escala PENDING/CONFIRMED no mesmo serviceAt desta congregação",
      );
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
