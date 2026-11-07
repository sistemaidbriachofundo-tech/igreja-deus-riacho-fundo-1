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

const PROGRESS_KINDS = ["STARTED", "COMPLETED", "REOPENED"] as const;
type ProgressKind = (typeof PROGRESS_KINDS)[number];

const MAX_PROGRESS_NOTE = 280;

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

  async createStage(
    actor: AuthUser,
    trackId: string,
    input: {
      title: string;
      description?: string;
      code?: string;
      sortOrder?: number;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const track = await this.requireTrack(trackId, pilot);

    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException("title é obrigatório");
    }

    const code = input.code?.trim() || null;
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined || sortOrder === null) {
      const agg = await this.prisma.discipleshipTrackStage.aggregate({
        where: { trackId: track.id },
        _max: { sortOrder: true },
      });
      sortOrder = (agg._max.sortOrder ?? 0) + 1;
    } else if (!Number.isInteger(sortOrder) || sortOrder < 1) {
      throw new BadRequestException("sortOrder deve ser inteiro >= 1");
    }

    return this.prisma.$transaction(async (tx) => {
      const stage = await tx.discipleshipTrackStage.create({
        data: {
          trackId: track.id,
          title,
          description: input.description?.trim() || null,
          code,
          sortOrder,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "discipleship.stage.create",
          resourceType: "discipleship_track_stage",
          resourceId: stage.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { trackId: track.id, sortOrder, code },
        },
      });
      return this.toStageDto(stage);
    });
  }

  async listStages(actor: AuthUser, trackId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);
    const track = await this.requireTrack(trackId, pilot);

    const rows = await this.prisma.discipleshipTrackStage.findMany({
      where: { trackId: track.id },
      orderBy: { sortOrder: "asc" },
    });

    return {
      trackId: track.id,
      stages: rows.map((row) => this.toStageDto(row)),
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

    const track = await this.requireTrack(input.trackId, pilot);

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

  async listEnrollments(
    actor: AuthUser,
    filters: { trackId?: string; personId?: string; status?: string } = {},
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const status = filters.status
      ? this.requireEnrollmentStatus(filters.status)
      : undefined;

    const rows = await this.prisma.discipleshipEnrollment.findMany({
      where: {
        ...(filters.trackId ? { trackId: filters.trackId } : {}),
        ...(filters.personId ? { personId: filters.personId } : {}),
        ...(status ? { status } : {}),
        track: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      },
      orderBy: { startedAt: "desc" },
    });

    return {
      churchId: pilot.churchId,
      enrollments: rows.map((row) => this.toEnrollmentDto(row)),
    };
  }

  async updateEnrollmentStatus(
    actor: AuthUser,
    enrollmentId: string,
    status: string,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const next = this.requireEnrollmentStatus(status);
    const enrollment = await this.requireEnrollment(enrollmentId, pilot);

    const completedAt = next === "COMPLETED" ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.discipleshipEnrollment.update({
        where: { id: enrollment.id },
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
          resourceId: enrollment.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { status: next },
        },
      });
      return this.toEnrollmentDto(updated);
    });
  }

  async recordProgress(
    actor: AuthUser,
    enrollmentId: string,
    input: { stageId: string; kind: string; note?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const kind = this.requireProgressKind(input.kind);
    if (!input.stageId?.trim()) {
      throw new BadRequestException("stageId é obrigatório");
    }

    const note = this.normalizeProgressNote(input.note);
    const enrollment = await this.requireEnrollment(enrollmentId, pilot);

    const stage = await this.prisma.discipleshipTrackStage.findFirst({
      where: { id: input.stageId, trackId: enrollment.trackId },
    });
    if (!stage) {
      throw new BadRequestException(
        "Etapa não pertence à trilha desta matrícula",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.discipleshipProgressEvent.create({
        data: {
          enrollmentId: enrollment.id,
          stageId: stage.id,
          kind,
          note,
          recordedByUserId: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "discipleship.progress.record",
          resourceType: "discipleship_progress_event",
          resourceId: event.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            enrollmentId: enrollment.id,
            stageId: stage.id,
            kind,
          },
        },
      });
      return this.toProgressEventDto(event);
    });
  }

  async getProgress(actor: AuthUser, enrollmentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertLead(actor, pilot.organizationId, pilot.churchId);

    const enrollment = await this.requireEnrollment(enrollmentId, pilot);
    const stages = await this.prisma.discipleshipTrackStage.findMany({
      where: { trackId: enrollment.trackId },
      orderBy: { sortOrder: "asc" },
    });
    const events = await this.prisma.discipleshipProgressEvent.findMany({
      where: { enrollmentId: enrollment.id },
      orderBy: { recordedAt: "asc" },
    });

    const latestByStage = new Map<string, (typeof events)[number]>();
    for (const event of events) {
      latestByStage.set(event.stageId, event);
    }

    const stageSummaries = stages.map((stage) => {
      const latest = latestByStage.get(stage.id) ?? null;
      return {
        ...this.toStageDto(stage),
        latestKind: latest?.kind ?? null,
        latestRecordedAt: latest?.recordedAt.toISOString() ?? null,
        completed: latest?.kind === "COMPLETED",
      };
    });

    const currentStage =
      stageSummaries.find((s) => !s.completed) ??
      stageSummaries[stageSummaries.length - 1] ??
      null;

    return {
      enrollment: this.toEnrollmentDto(enrollment),
      spiritualScoreExcluded: true as const,
      stages: stageSummaries,
      currentStageId: currentStage?.id ?? null,
      completedStageCount: stageSummaries.filter((s) => s.completed).length,
      totalStageCount: stageSummaries.length,
      history: events.map((e) => this.toProgressEventDto(e)),
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

  private async requireTrack(
    trackId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const track = await this.prisma.discipleshipTrack.findFirst({
      where: {
        id: trackId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!track) {
      throw new NotFoundException("Trilha de discipulado não encontrada");
    }
    return track;
  }

  private async requireEnrollment(
    enrollmentId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
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
    return enrollment;
  }

  private requireEnrollmentStatus(status: string): EnrollmentStatus {
    if ((ENROLLMENT_STATUSES as readonly string[]).includes(status)) {
      return status as EnrollmentStatus;
    }
    throw new BadRequestException(`status inválido: ${status}`);
  }

  private requireProgressKind(kind: string): ProgressKind {
    if ((PROGRESS_KINDS as readonly string[]).includes(kind)) {
      return kind as ProgressKind;
    }
    throw new BadRequestException(`kind inválido: ${kind}`);
  }

  private normalizeProgressNote(note?: string): string | null {
    if (note === undefined || note === null) return null;
    const trimmed = note.trim();
    if (!trimmed) return null;
    if (trimmed.length > MAX_PROGRESS_NOTE) {
      throw new BadRequestException(
        `note deve ter no máximo ${MAX_PROGRESS_NOTE} caracteres`,
      );
    }
    return trimmed;
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

  private toStageDto(stage: {
    id: string;
    trackId: string;
    sortOrder: number;
    code: string | null;
    title: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: stage.id,
      trackId: stage.trackId,
      sortOrder: stage.sortOrder,
      code: stage.code,
      title: stage.title,
      description: stage.description,
      createdAt: stage.createdAt.toISOString(),
      updatedAt: stage.updatedAt.toISOString(),
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

  private toProgressEventDto(row: {
    id: string;
    enrollmentId: string;
    stageId: string;
    kind: string;
    note: string | null;
    recordedByUserId: string | null;
    recordedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      enrollmentId: row.enrollmentId,
      stageId: row.stageId,
      kind: row.kind,
      note: row.note,
      recordedByUserId: row.recordedByUserId,
      recordedAt: row.recordedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
