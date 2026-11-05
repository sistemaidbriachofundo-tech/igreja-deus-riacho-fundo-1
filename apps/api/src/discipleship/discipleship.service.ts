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

const ENROLLMENT_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "PAUSED",
  "CANCELLED",
] as const;

type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

@Injectable()
export class DiscipleshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async createTrack(
    actor: AuthUser,
    input: { name: string; description?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException("name é obrigatório");
    }

    return this.prisma.$transaction(async (tx) => {
      const track = await tx.discipleshipTrack.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name,
          description: input.description?.trim() || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "discipleship.track.create",
          resourceType: "discipleship_track",
          resourceId: track.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { name },
        },
      });
      return this.toTrackDto(track);
    });
  }

  async listTracks(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const rows = await this.prisma.discipleshipTrack.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      churchId: pilot.churchId,
      tracks: rows.map((row) => this.toTrackDto(row)),
    };
  }

  async enroll(
    actor: AuthUser,
    input: { trackId: string; personId: string; mentorPersonId?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    if (!input.trackId?.trim() || !input.personId?.trim()) {
      throw new BadRequestException("trackId e personId são obrigatórios");
    }

    const track = await this.prisma.discipleshipTrack.findFirst({
      where: {
        id: input.trackId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!track) {
      throw new NotFoundException("Trilha de discipulado não encontrada");
    }

    const person = await this.prisma.person.findFirst({
      where: {
        id: input.personId,
        organizationId: pilot.organizationId,
      },
      select: { id: true },
    });
    if (!person) {
      throw new BadRequestException("Pessoa não encontrada neste escopo");
    }

    if (input.mentorPersonId) {
      const mentor = await this.prisma.person.findFirst({
        where: {
          id: input.mentorPersonId,
          organizationId: pilot.organizationId,
        },
        select: { id: true },
      });
      if (!mentor) {
        throw new BadRequestException("Mentor não encontrado neste escopo");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.discipleshipEnrollment.create({
        data: {
          trackId: track.id,
          personId: person.id,
          mentorPersonId: input.mentorPersonId ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "discipleship.enrollment.create",
          resourceType: "discipleship_enrollment",
          resourceId: enrollment.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { trackId: track.id, personId: person.id },
        },
      });
      return this.toEnrollmentDto(enrollment);
    });
  }

  async updateEnrollmentStatus(
    actor: AuthUser,
    enrollmentId: string,
    status: string,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const next = this.requireEnrollmentStatus(status);
    const enrollment = await this.prisma.discipleshipEnrollment.findFirst({
      where: { id: enrollmentId },
      include: {
        track: {
          select: {
            id: true,
            organizationId: true,
            churchId: true,
          },
        },
      },
    });
    if (
      !enrollment ||
      enrollment.track.organizationId !== pilot.organizationId ||
      enrollment.track.churchId !== pilot.churchId
    ) {
      throw new NotFoundException("Matrícula de discipulado não encontrada");
    }

    const completedAt = next === "COMPLETED" ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.discipleshipEnrollment.update({
        where: { id: enrollmentId },
        data: {
          status: next,
          completedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "discipleship.enrollment.status",
          resourceType: "discipleship_enrollment",
          resourceId: enrollmentId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { status: next },
        },
      });
      return this.toEnrollmentDto(updated);
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

  private requireEnrollmentStatus(status: string): EnrollmentStatus {
    if ((ENROLLMENT_STATUSES as readonly string[]).includes(status)) {
      return status as EnrollmentStatus;
    }
    throw new BadRequestException(`status inválido: ${status}`);
  }

  private toTrackDto(track: {
    id: string;
    organizationId: string;
    churchId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: track.id,
      organizationId: track.organizationId,
      churchId: track.churchId,
      name: track.name,
      description: track.description,
      createdAt: track.createdAt.toISOString(),
      updatedAt: track.updatedAt.toISOString(),
    };
  }

  private toEnrollmentDto(row: {
    id: string;
    trackId: string;
    personId: string;
    mentorPersonId: string | null;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      trackId: row.trackId,
      personId: row.personId,
      mentorPersonId: row.mentorPersonId,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
