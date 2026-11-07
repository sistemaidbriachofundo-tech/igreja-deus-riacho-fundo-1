import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canLeadMinistry } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

const MEMBER_ROLES = ["LEADER", "MEMBER"] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async create(
    actor: AuthUser,
    input: {
      name: string;
      leaderPersonId?: string;
      meetsAtHint?: string;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException("name é obrigatório");
    }

    if (input.leaderPersonId) {
      await this.requirePerson(input.leaderPersonId, pilot.organizationId);
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.smallGroup.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name,
          leaderPersonId: input.leaderPersonId ?? null,
          meetsAtHint: input.meetsAtHint?.trim() || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "small_group.create",
          resourceType: "small_group",
          resourceId: group.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { name },
        },
      });
      return this.toGroupDto(group);
    });
  }

  async list(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const rows = await this.prisma.smallGroup.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          select: { id: true, personId: true, role: true, joinedAt: true },
        },
      },
    });

    return {
      churchId: pilot.churchId,
      groups: rows.map((row) => ({
        ...this.toGroupDto(row),
        members: row.members.map((m) => ({
          id: m.id,
          personId: m.personId,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        })),
      })),
    };
  }

  async addMember(
    actor: AuthUser,
    groupId: string,
    input: { personId: string; role?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    await this.requireGroup(groupId, pilot);
    await this.requirePerson(input.personId, pilot.organizationId);

    const role = this.requireMemberRole(input.role ?? "MEMBER");

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.smallGroupMember.create({
        data: {
          groupId,
          personId: input.personId,
          role,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "small_group.add_member",
          resourceType: "small_group",
          resourceId: groupId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { personId: input.personId, role },
        },
      });
      return {
        id: member.id,
        groupId: member.groupId,
        personId: member.personId,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      };
    });
  }

  /**
   * Relatório operacional de frequência (RF-011).
   * Agrega presença já registrada — sem pontuação espiritual / maturidade.
   */
  async frequencyReport(
    actor: AuthUser,
    filters: { from?: string; to?: string; groupId?: string } = {},
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const { from, to } = this.requireDateRange(filters.from, filters.to);

    if (filters.groupId) {
      await this.requireGroup(filters.groupId, pilot);
    }

    const groups = await this.prisma.smallGroup.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(filters.groupId ? { id: filters.groupId } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        members: {
          select: { personId: true, role: true, joinedAt: true },
        },
        meetings: {
          where: {
            occurredAt: { gte: from, lte: to },
          },
          orderBy: { occurredAt: "asc" },
          include: {
            attendances: {
              select: { personId: true, present: true },
            },
          },
        },
      },
    });

    const groupReports = groups.map((group) => {
      const meetingCount = group.meetings.length;
      let presentCount = 0;
      let absentCount = 0;
      const byPerson = new Map<
        string,
        { presentCount: number; absentCount: number }
      >();

      for (const meeting of group.meetings) {
        for (const att of meeting.attendances) {
          const bucket = byPerson.get(att.personId) ?? {
            presentCount: 0,
            absentCount: 0,
          };
          if (att.present) {
            presentCount += 1;
            bucket.presentCount += 1;
          } else {
            absentCount += 1;
            bucket.absentCount += 1;
          }
          byPerson.set(att.personId, bucket);
        }
      }

      const attendanceRecords = presentCount + absentCount;
      const memberPersonIds = new Set(group.members.map((m) => m.personId));
      for (const personId of byPerson.keys()) {
        memberPersonIds.add(personId);
      }

      const members = [...memberPersonIds].sort().map((personId) => {
        const stats = byPerson.get(personId) ?? {
          presentCount: 0,
          absentCount: 0,
        };
        const recorded = stats.presentCount + stats.absentCount;
        return {
          personId,
          meetingsInPeriod: meetingCount,
          recordedAttendanceCount: recorded,
          presentCount: stats.presentCount,
          absentCount: stats.absentCount,
          presentRate:
            recorded === 0
              ? null
              : Number((stats.presentCount / recorded).toFixed(4)),
        };
      });

      return {
        groupId: group.id,
        name: group.name,
        leaderPersonId: group.leaderPersonId,
        memberCount: group.members.length,
        meetingCount,
        attendanceRecords,
        presentCount,
        absentCount,
        presentRate:
          attendanceRecords === 0
            ? null
            : Number((presentCount / attendanceRecords).toFixed(4)),
        members,
      };
    });

    return {
      churchId: pilot.churchId,
      from: from.toISOString(),
      to: to.toISOString(),
      spiritualScoreExcluded: true as const,
      metric: "operational_attendance" as const,
      groups: groupReports,
    };
  }

  async createMeeting(
    actor: AuthUser,
    groupId: string,
    input: {
      occurredAt: string;
      notes?: string;
      attendance?: Array<{ personId: string; present?: boolean }>;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    await this.requireGroup(groupId, pilot);

    const occurredAt = new Date(input.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException("occurredAt inválido");
    }

    const attendance = input.attendance ?? [];
    if (attendance.length) {
      const ids = [...new Set(attendance.map((a) => a.personId))];
      const found = await this.prisma.person.findMany({
        where: {
          id: { in: ids },
          organizationId: pilot.organizationId,
        },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        throw new BadRequestException(
          "Uma ou mais pessoas da presença não existem neste escopo",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.groupMeeting.create({
        data: {
          groupId,
          occurredAt,
          notes: input.notes?.trim() || null,
          attendances: attendance.length
            ? {
                create: attendance.map((a) => ({
                  personId: a.personId,
                  present: a.present !== false,
                })),
              }
            : undefined,
        },
        include: { attendances: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "small_group.meeting.create",
          resourceType: "group_meeting",
          resourceId: meeting.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            groupId,
            attendanceCount: meeting.attendances.length,
          },
        },
      });
      return {
        id: meeting.id,
        groupId: meeting.groupId,
        occurredAt: meeting.occurredAt.toISOString(),
        notes: meeting.notes,
        createdAt: meeting.createdAt.toISOString(),
        attendance: meeting.attendances.map((a) => ({
          id: a.id,
          personId: a.personId,
          present: a.present,
        })),
      };
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

  private async requireGroup(
    groupId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const group = await this.prisma.smallGroup.findFirst({
      where: {
        id: groupId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!group) {
      throw new NotFoundException("Célula não encontrada");
    }
    return group;
  }

  private requireMemberRole(role: string): MemberRole {
    if ((MEMBER_ROLES as readonly string[]).includes(role)) {
      return role as MemberRole;
    }
    throw new BadRequestException(`role inválido: ${role}`);
  }

  private requireDateRange(fromRaw?: string, toRaw?: string): {
    from: Date;
    to: Date;
  } {
    const to = toRaw ? new Date(toRaw) : new Date();
    const from = fromRaw
      ? new Date(fromRaw)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("from/to inválidos (ISO-8601)");
    }
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException("from deve ser <= to");
    }
    return { from, to };
  }

  private toGroupDto(group: {
    id: string;
    organizationId: string;
    churchId: string;
    name: string;
    leaderPersonId: string | null;
    meetsAtHint: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: group.id,
      organizationId: group.organizationId,
      churchId: group.churchId,
      name: group.name,
      leaderPersonId: group.leaderPersonId,
      meetsAtHint: group.meetsAtHint,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };
  }
}
