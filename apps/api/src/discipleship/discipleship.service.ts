import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { grantMatchesScope, ROLE_CODES } from "@idbrf/shared";
import type { Prisma } from "@prisma/client";
import { requireConnectionManagement } from "./connection-access";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { BusinessException } from "../common/business.exception";
import { baptismWaived, CONNECTION_STAGES, CONNECTION_TRACK_CODE, CONNECTION_TRACK_NAME, isConnectionTrack, isConnectionTrackName } from "./connection-rules";

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

function congregationPeople(organizationId: string, churchId: string): Prisma.PersonWhereInput {
  return {
    organizationId,
    OR: [{ homeChurchId: churchId }, { memberships: { some: { churchId, status: { in: ["ACTIVE", "PENDING_ADMISSION"] } } } }],
  };
}

function canSelfEnroll(actor: AuthUser, organizationId: string, churchId: string): boolean {
  return Boolean(actor.personId) && actor.organizationId === organizationId && actor.churchId === churchId &&
    actor.grants.some(grant => grantMatchesScope(grant, {
      organizationId, churchId, roleCodes: [ROLE_CODES.MEMBRO, ROLE_CODES.CONVIDADO],
    }));
}

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
    await requireConnectionManagement(this.prisma, actor, pilot);

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException("name é obrigatório");
    }

    const official = isConnectionTrackName(name);
    const description = input.description?.trim() || null;
    const where = { churchId_code: { churchId: pilot.churchId, code: CONNECTION_TRACK_CODE } };
    return this.prisma.$transaction(async (tx) => {
      if (official) {
        const established = await tx.discipleshipTrack.findUnique({ where });
        if (established) return this.toTrackDto(established);
      }
      const track = await tx.discipleshipTrack.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name: official ? CONNECTION_TRACK_NAME : name,
          description,
          ...(official ? {
            code: CONNECTION_TRACK_CODE,
            stages: { create: CONNECTION_STAGES.map((stage, index) => ({ ...stage, sortOrder: index + 1 })) },
          } : {}),
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
    }).catch(async (error: unknown) => {
      if (official && typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        const established = await this.prisma.discipleshipTrack.findUnique({ where });
        if (established) return this.toTrackDto(established);
      }
      throw error;
    });
  }

  async listTracks(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);

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

  async listMentors(actor: AuthUser, trackId: string) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);
    const track = await this.requireTrack(trackId, pilot);
    const rows = await this.prisma.discipleshipMentorRegistration.findMany({
      where: { trackId: track.id, person: { ...congregationPeople(pilot.organizationId, pilot.churchId), status: "ACTIVE", isMinor: false } },
      select: { person: { select: { id: true, displayName: true } } },
      orderBy: [{ person: { displayName: "asc" } }, { personId: "asc" }],
    });
    return { mentors: rows.map(row => row.person) };
  }

  async registerMentor(actor: AuthUser, trackId: string, personId: string) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);
    const track = await this.requireTrack(trackId, pilot);
    await this.requireMentor(personId, "", pilot);
    return this.prisma.$transaction(async tx => {
      const inserted = await tx.discipleshipMentorRegistration.createMany({ data: [{ trackId: track.id, personId }], skipDuplicates: true });
      if (inserted.count > 0) await tx.auditLog.create({
        data: {
          actorUserId: actor.userId, action: "discipleship.mentor.register",
          resourceType: "discipleship_track", resourceId: track.id, metadata: { personId },
          organizationId: pilot.organizationId, churchId: pilot.churchId,
        },
      });
      return { personId };
    });
  }

  async searchPeople(actor: AuthUser, search: string) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);
    const query = search.trim().slice(0, 100);
    if (query.length < 2) return { people: [] };
    const people = await this.prisma.person.findMany({
      where: {
        ...congregationPeople(pilot.organizationId, pilot.churchId),
        status: "ACTIVE", displayName: { contains: query, mode: "insensitive" },
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: { id: true, displayName: true },
      take: 15,
    });
    return { people };
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
    await requireConnectionManagement(this.prisma, actor, pilot);
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

  async editStage(actor: AuthUser, trackId: string, stageId: string, input: { title: string; description: string }) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);
    const track = await this.requireTrack(trackId, pilot);
    const title = input.title.trim();
    if (!title) throw new BadRequestException("Informe o nome da etapa.");
    return this.prisma.$transaction(async tx => {
      const updated = await tx.discipleshipTrackStage.updateMany({
        where: { id: stageId, trackId: track.id },
        data: { title, description: input.description.trim() || null },
      });
      if (!updated.count) throw new NotFoundException("Etapa não encontrada nesta trilha.");
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "discipleship.stage.update", resourceType: "discipleship_track_stage",
        resourceId: stageId, organizationId: pilot.organizationId, churchId: pilot.churchId,
        metadata: { trackId, title },
      } });
      return this.toStageDto(await tx.discipleshipTrackStage.findUniqueOrThrow({ where: { id: stageId } }));
    });
  }

  async listStages(actor: AuthUser, trackId: string) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);
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
    await requireConnectionManagement(this.prisma, actor, pilot);

    if (!input.trackId?.trim() || !input.personId?.trim()) {
      throw new BadRequestException("trackId e personId são obrigatórios");
    }

    const track = await this.requireTrack(input.trackId, pilot);

    const person = await this.prisma.person.findFirst({
      where: {
        id: input.personId,
        ...congregationPeople(pilot.organizationId, pilot.churchId),
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!person) {
      throw new BadRequestException("Pessoa não encontrada neste escopo");
    }

    if (input.mentorPersonId) await this.requireMentor(input.mentorPersonId, person.id, pilot);

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
    }).catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new ConflictException("Esta pessoa já está matriculada na trilha.");
      }
      throw error;
    });
  }

  async listEnrollments(
    actor: AuthUser,
    filters: { trackId?: string; personId?: string; status?: string } = {},
  ) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);

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
      include: {
        person: { select: { displayName: true } }, mentor: { select: { displayName: true } },
        track: { select: { code: true, name: true, stages: { orderBy: { sortOrder: "asc" } } } },
        progress: {
          orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: { stageId: true, kind: true },
        },
      },
      orderBy: { startedAt: "desc" },
    });
    const active = rows.filter(row => row.status === "ACTIVE" || row.status === "PAUSED");
    const peopleWithWaivableStage = active.filter(row => row.track && isConnectionTrack(row.track)
      && row.track.stages.some(stage => baptismWaived(stage.code, "TRANSFERENCIA"))).map(row => row.personId);
    const admissions = peopleWithWaivableStage.length ? await this.prisma.admissionProtocol.findMany({
      where: { organizationId: pilot.organizationId, churchId: pilot.churchId, status: "APPROVED",
        pastorApproved: true, personId: { in: peopleWithWaivableStage } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      distinct: ["personId"],
      select: { personId: true, modality: true },
    }) : [];
    const modalities = new Map(admissions.map(row => [row.personId, row.modality]));
    const currentStages = new Map(active.map(row => {
      const latest = new Map(row.progress?.map(event => [event.stageId, event.kind]));
      const modality = modalities.get(row.personId) ?? null;
      return [row.id, row.track?.stages.find(stage =>
        latest.get(stage.id) !== "COMPLETED" && !baptismWaived(stage.code, modality),
      )?.id ?? null] as const;
    }));

    return {
      churchId: pilot.churchId,
      enrollments: rows.map((row) => ({
        ...this.toEnrollmentDto(row), personName: row.person?.displayName ?? null, mentorName: row.mentor?.displayName ?? null,
        currentStageId: currentStages.get(row.id) ?? null,
      })),
    };
  }

  async updateMentor(actor: AuthUser, enrollmentId: string, mentorPersonId: string | null) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);
    const enrollment = await this.requireEnrollment(enrollmentId, pilot);
    if (mentorPersonId !== null) await this.requireMentor(mentorPersonId, enrollment.personId, pilot);
    if (enrollment.mentorPersonId === mentorPersonId) return this.toEnrollmentDto(enrollment);
    return this.prisma.$transaction(async tx => {
      const updated = await tx.discipleshipEnrollment.update({
        where: { id: enrollment.id }, data: { mentorPersonId },
      });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "discipleship.enrollment.mentor", resourceType: "discipleship_enrollment",
        resourceId: enrollment.id, organizationId: pilot.organizationId, churchId: pilot.churchId,
        metadata: { mentorAssigned: Boolean(mentorPersonId) },
      } });
      return this.toEnrollmentDto(updated);
    });
  }

  async updateEnrollmentStatus(
    actor: AuthUser,
    enrollmentId: string,
    status: string,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);

    const next = this.requireEnrollmentStatus(status);
    const enrollment = await this.requireEnrollment(enrollmentId, pilot);

    return this.prisma.$transaction(async (tx) => {
      const completedAt = next === "COMPLETED" ? new Date() : null;
      if (isConnectionTrack(enrollment.track)) {
        const current = await this.lockConnectionEnrollment(tx, enrollment.id);
        if (next === "COMPLETED") {
          const progress = await this.connectionProgress(tx, current, pilot);
          this.requireOfficialStages(progress.configured);
          if (progress.pending) {
            throw new BusinessException("Conclua a etapa pendente: " + progress.pending.title + ".", "CONNECTION_STAGES_PENDING");
          }
          if (current.status === "COMPLETED" && current.completedAt) return this.toEnrollmentDto(current);
        }
      }
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
    await requireConnectionManagement(this.prisma, actor, pilot);

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
      if (isConnectionTrack(enrollment.track)) {
        const current = await this.lockConnectionEnrollment(tx, enrollment.id);
        if (current.status !== "ACTIVE") {
          throw new BusinessException("Coloque a matrícula em andamento para registrar progresso.", "CONNECTION_NOT_ACTIVE");
        }
        const progress = await this.connectionProgress(tx, current, pilot);
        this.requireOfficialStages(progress.configured);
        const target = progress.stages.find(item => item.id === stage.id);
        if (!target || target.waived) {
          throw new BusinessException("Esta etapa não se aplica ao percurso da pessoa.", "CONNECTION_STAGE_NOT_APPLICABLE");
        }
        if (kind !== "REOPENED" && progress.pending?.id !== stage.id) {
          throw new BusinessException(
            progress.pending ? "Registre primeiro a etapa " + progress.pending.title + "." : "Todas as etapas já foram registradas.",
            "CONNECTION_STAGE_OUT_OF_ORDER",
          );
        }
        if (kind === "REOPENED" && !target.completed) {
          throw new BusinessException("Só é possível reabrir uma etapa concluída.", "CONNECTION_STAGE_NOT_COMPLETED");
        }
      }
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

  async enrollInConnection(actor: AuthUser) {
    const { organizationId, churchId } = await this.pilot.getPilotChurch();
    if (!canSelfEnroll(actor, organizationId, churchId)) throw new ForbiddenException();

    const person = await this.prisma.person.findFirst({
      where: { id: actor.personId, ...congregationPeople(organizationId, churchId), status: "ACTIVE" },
      select: { id: true },
    });
    if (!person) throw new ForbiddenException("O cadastro precisa estar ativo nesta congregação.");

    await this.prisma.$transaction(async tx => {
      // Cria o registro oficial uma vez, inclusive no primeiro uso da congregação.
      await tx.discipleshipTrack.createMany({
        data: [{ organizationId, churchId, code: CONNECTION_TRACK_CODE, name: CONNECTION_TRACK_NAME }],
        skipDuplicates: true,
      });
      const track = await tx.discipleshipTrack.findFirstOrThrow({
        where: { organizationId, churchId, code: CONNECTION_TRACK_CODE },
        select: { id: true, stages: { select: { code: true } } },
      });
      if (track.stages.length === 0) {
        await tx.discipleshipTrackStage.createMany({
          data: CONNECTION_STAGES.map((stage, index) => ({ ...stage, trackId: track.id, sortOrder: index + 1 })),
          skipDuplicates: true,
        });
      } else {
        this.requireOfficialStages(CONNECTION_STAGES.every(stage => track.stages.some(current => current.code === stage.code)));
      }

      const result = await tx.discipleshipEnrollment.createMany({
        data: [{ trackId: track.id, personId: person.id }],
        skipDuplicates: true,
      });
      if (!result.count) {
        const previous = await tx.discipleshipEnrollment.findUniqueOrThrow({
          where: { trackId_personId: { trackId: track.id, personId: person.id } },
          select: { status: true },
        });
        if (previous.status === "CANCELLED") throw new ConflictException("Procure a equipe da Conexão para retomar sua trilha.");
        return;
      }
      const enrollment = await tx.discipleshipEnrollment.findUniqueOrThrow({
        where: { trackId_personId: { trackId: track.id, personId: person.id } },
        select: { id: true },
      });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, organizationId, churchId, action: "discipleship.enrollment.self",
        resourceType: "discipleship_enrollment", resourceId: enrollment.id,
      }});
    });

    return this.myConnectionJourney(actor);
  }

  async myConnectionJourney(actor: AuthUser) {
    const { organizationId, churchId } = await this.pilot.getPilotChurch();
    const scope = { organizationId, churchId, roleCodes: Object.values(ROLE_CODES) };
    if (!actor.personId || (actor.organizationId && actor.organizationId !== organizationId) ||
        (actor.churchId && actor.churchId !== churchId) ||
        !actor.grants.some(grant => grantMatchesScope(grant, scope))) throw new ForbiddenException();

    const enrollments = await this.prisma.discipleshipEnrollment.findMany({
      where: { personId: actor.personId, status: { not: "CANCELLED" }, track: { organizationId, churchId } },
      orderBy: [{ startedAt: "desc" }, { id: "asc" }],
      select: {
        id: true, status: true, mentor: { select: { displayName: true } },
        track: { select: { name: true, code: true, stages: { orderBy: { sortOrder: "asc" }, select: { id: true, code: true, title: true, description: true } } } },
      },
    });
    const journey = enrollments.find(row => isConnectionTrack(row.track));
    if (!journey) {
      if (!canSelfEnroll(actor, organizationId, churchId)) return { journey: null };
      const cancelled = await this.prisma.discipleshipEnrollment.findFirst({
        where: { personId: actor.personId, status: "CANCELLED", track: { organizationId, churchId, code: CONNECTION_TRACK_CODE } },
        select: { id: true },
      });
      return {
        journey: null,
        canSelfEnroll: !cancelled,
        previewStages: CONNECTION_STAGES.map(({ code, title, description }) => ({ id: code, title, description })),
      };
    }

    const track = await this.prisma.discipleshipProgressEvent.findMany({
      where: { enrollmentId: journey.id }, orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { stageId: true, kind: true },
    });
    const latest = new Map(track.map(event => [event.stageId, event.kind]));
    const modality = journey.track.stages.some(stage => baptismWaived(stage.code, "TRANSFERENCIA"))
      ? await this.approvedModality(this.prisma, actor.personId, { organizationId, churchId })
      : null;
    const stages = journey.track.stages.map(({ code, ...stage }) => ({
      ...stage, completed: latest.get(stage.id) === "COMPLETED", waived: baptismWaived(code, modality),
    }));
    return { journey: { name: journey.track.name, status: journey.status, mentorName: journey.mentor?.displayName ?? null,
      stages, currentStageId: journey.status === "COMPLETED" ? null : stages.find(stage => !stage.completed && !stage.waived)?.id ?? null } };
  }

  async getProgress(actor: AuthUser, enrollmentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    await requireConnectionManagement(this.prisma, actor, pilot);

    const enrollment = await this.requireEnrollment(enrollmentId, pilot);
    const stages = await this.prisma.discipleshipTrackStage.findMany({
      where: { trackId: enrollment.trackId },
      orderBy: { sortOrder: "asc" },
    });
    const events = await this.prisma.discipleshipProgressEvent.findMany({
      where: { enrollmentId: enrollment.id },
      orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });

    const latestByStage = new Map<string, (typeof events)[number]>();
    for (const event of events) {
      latestByStage.set(event.stageId, event);
    }

    const official = isConnectionTrack(enrollment.track);
    const modality = official && stages.some(stage => baptismWaived(stage.code, "TRANSFERENCIA"))
      ? await this.approvedModality(this.prisma, enrollment.personId, pilot)
      : null;
    const stageSummaries = stages.map((stage) => {
      const latest = latestByStage.get(stage.id) ?? null;
      return {
        ...this.toStageDto(stage),
        latestKind: latest?.kind ?? null,
        latestRecordedAt: latest?.recordedAt.toISOString() ?? null,
        completed: latest?.kind === "COMPLETED",
        waived: baptismWaived(stage.code, modality),
      };
    });

    const pending = stageSummaries.find(stage => !stage.completed && !stage.waived);
    const configured = !official || CONNECTION_STAGES.every(({ code }) => stages.some(stage => stage.code === code));
    const currentStage = enrollment.status === "COMPLETED" ? null : pending;

    return {
      enrollment: this.toEnrollmentDto(enrollment),
      spiritualScoreExcluded: true as const,
      stages: stageSummaries,
      currentStageId: currentStage?.id ?? null,
      ...(official ? { enforceOrder: true, canComplete: configured && !pending } : {}),
      completedStageCount: stageSummaries.filter((s) => s.completed).length,
      totalStageCount: stageSummaries.length,
      history: events.map((e) => this.toProgressEventDto(e)),
    };
  }

  private async lockConnectionEnrollment(tx: Prisma.TransactionClient, enrollmentId: string) {
    await tx.$queryRaw`SELECT id FROM discipleship_enrollments WHERE id = ${enrollmentId} FOR UPDATE`;
    return tx.discipleshipEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
  }

  private async approvedModality(
    db: Prisma.TransactionClient, personId: string, pilot: { organizationId: string; churchId: string },
  ) {
    const protocol = await db.admissionProtocol.findFirst({
      where: {
        personId, organizationId: pilot.organizationId, churchId: pilot.churchId,
        status: "APPROVED", pastorApproved: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { modality: true },
    });
    return protocol?.modality ?? null;
  }

  private async connectionProgress(
    tx: Prisma.TransactionClient,
    enrollment: { id: string; trackId: string; personId: string },
    pilot: { organizationId: string; churchId: string },
  ) {
    const [stages, events, modality] = await Promise.all([
      tx.discipleshipTrackStage.findMany({ where: { trackId: enrollment.trackId }, orderBy: { sortOrder: "asc" } }),
      tx.discipleshipProgressEvent.findMany({
        where: { enrollmentId: enrollment.id },
        orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { stageId: true, kind: true },
      }),
      this.approvedModality(tx, enrollment.personId, pilot),
    ]);
    const latest = new Map(events.map(event => [event.stageId, event.kind]));
    const progress = stages.map(stage => ({
      ...stage, completed: latest.get(stage.id) === "COMPLETED", waived: baptismWaived(stage.code, modality),
    }));
    return {
      configured: CONNECTION_STAGES.every(({ code }) => stages.some(stage => stage.code === code)),
      stages: progress,
      pending: progress.find(stage => !stage.completed && !stage.waived),
    };
  }

  private requireOfficialStages(configured: boolean) {
    if (!configured) {
      throw new BusinessException("Cadastre as nove etapas oficiais antes de registrar o progresso da Trilha da Conexão.", "CONNECTION_STAGES_NOT_CONFIGURED");
    }
  }

  private async requireMentor(id: string, participantId: string, pilot: { organizationId: string; churchId: string }) {
    if (!id?.trim() || id === participantId) throw new BadRequestException("Selecione um mentor diferente do participante.");
    const mentor = await this.prisma.person.findFirst({
      where: { id, ...congregationPeople(pilot.organizationId, pilot.churchId), status: "ACTIVE", isMinor: false },
      select: { id: true },
    });
    if (!mentor) throw new BadRequestException("Mentor não encontrado neste escopo");
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
            name: true,
            code: true,
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
    code?: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: track.id,
      organizationId: track.organizationId,
      churchId: track.churchId,
      code: track.code ?? null,
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
