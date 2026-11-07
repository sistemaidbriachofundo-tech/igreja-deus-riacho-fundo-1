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

const COURSE_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
const ENROLLMENT_STATUSES = [
  "ENROLLED",
  "COMPLETED",
  "DROPPED",
  "CANCELLED",
] as const;

type CourseStatus = (typeof COURSE_STATUSES)[number];
type ClassStatus = "OPEN" | "CLOSED" | "CANCELLED";
type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/**
 * RF-023 — Ensino EBD/cursos (domínio distinto de discipulado RF-010).
 * Matrícula, frequência e conclusão com metadado mínimo de certificado.
 */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async createCourse(
    actor: AuthUser,
    input: { name: string; code?: string; description?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException("name é obrigatório");
    }
    const code = input.code?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name,
          code,
          description: input.description?.trim() || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "course.create",
          resourceType: "course",
          resourceId: course.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { name, code },
        },
      });
      return this.toCourseDto(course);
    });
  }

  async listCourses(actor: AuthUser, status?: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);

    const statusFilter = status
      ? this.requireCourseStatus(status)
      : undefined;

    const rows = await this.prisma.course.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      churchId: pilot.churchId,
      domain: "ebd_courses" as const,
      distinctFrom: "discipleship" as const,
      courses: rows.map((row) => this.toCourseDto(row)),
    };
  }

  async createClass(
    actor: AuthUser,
    courseId: string,
    input: {
      name: string;
      teacherPersonId?: string;
      startsAt?: string;
      endsAt?: string;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);
    const course = await this.requireCourse(courseId, pilot);

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException("name é obrigatório");
    }

    if (input.teacherPersonId) {
      await this.requirePerson(input.teacherPersonId, pilot.organizationId);
    }

    const startsAt = this.parseOptionalDate(input.startsAt, "startsAt");
    const endsAt = this.parseOptionalDate(input.endsAt, "endsAt");
    if (startsAt && endsAt && endsAt < startsAt) {
      throw new BadRequestException("endsAt deve ser >= startsAt");
    }

    return this.prisma.$transaction(async (tx) => {
      const klass = await tx.courseClass.create({
        data: {
          courseId: course.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name,
          teacherPersonId: input.teacherPersonId ?? null,
          startsAt,
          endsAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "course.class.create",
          resourceType: "course_class",
          resourceId: klass.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { courseId: course.id, name },
        },
      });
      return this.toClassDto(klass);
    });
  }

  async listClasses(actor: AuthUser, courseId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);
    const course = await this.requireCourse(courseId, pilot);

    const rows = await this.prisma.courseClass.findMany({
      where: { courseId: course.id },
      orderBy: { createdAt: "desc" },
    });

    return {
      courseId: course.id,
      classes: rows.map((row) => this.toClassDto(row)),
    };
  }

  async enroll(
    actor: AuthUser,
    classId: string,
    input: { personId: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);
    const klass = await this.requireClass(classId, pilot);
    if (klass.status !== "OPEN") {
      throw new BadRequestException("Turma não está OPEN para matrícula");
    }
    await this.requirePerson(input.personId, pilot.organizationId);

    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.courseEnrollment.create({
        data: {
          classId: klass.id,
          personId: input.personId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "course.enrollment.create",
          resourceType: "course_enrollment",
          resourceId: enrollment.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { classId: klass.id, personId: input.personId },
        },
      });
      return this.toEnrollmentDto(enrollment);
    });
  }

  async listEnrollments(
    actor: AuthUser,
    filters: { classId?: string; personId?: string; status?: string } = {},
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);

    if (filters.classId) {
      await this.requireClass(filters.classId, pilot);
    }
    const status = filters.status
      ? this.requireEnrollmentStatus(filters.status)
      : undefined;

    const rows = await this.prisma.courseEnrollment.findMany({
      where: {
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.personId ? { personId: filters.personId } : {}),
        ...(status ? { status } : {}),
        class: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    return {
      churchId: pilot.churchId,
      enrollments: rows.map((row) => this.toEnrollmentDto(row)),
    };
  }

  async completeEnrollment(
    actor: AuthUser,
    enrollmentId: string,
    input: { issueCertificate?: boolean } = {},
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);
    const enrollment = await this.requireEnrollment(enrollmentId, pilot);

    if (enrollment.status === "COMPLETED") {
      return this.toEnrollmentDto(enrollment);
    }
    if (enrollment.status !== "ENROLLED") {
      throw new BadRequestException(
        "Só matrícula ENROLLED pode ser concluída",
      );
    }

    const issueCertificate = Boolean(input.issueCertificate);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.courseEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          ...(issueCertificate
            ? {
                certificateApprovedByUserId: actor.userId,
                certificateIssuedAt: now,
              }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "course.enrollment.complete",
          resourceType: "course_enrollment",
          resourceId: enrollment.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            issueCertificate,
            personId: enrollment.personId,
            classId: enrollment.classId,
          },
        },
      });
      return this.toEnrollmentDto(updated);
    });
  }

  async createSession(
    actor: AuthUser,
    classId: string,
    input: {
      occurredAt: string;
      title?: string;
      attendances?: Array<{ personId: string; present?: boolean }>;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);
    const klass = await this.requireClass(classId, pilot);

    const occurredAt = this.parseOptionalDate(input.occurredAt, "occurredAt");
    if (!occurredAt) {
      throw new BadRequestException("occurredAt é obrigatório");
    }

    const attendances = input.attendances ?? [];
    for (const row of attendances) {
      await this.requirePerson(row.personId, pilot.organizationId);
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.courseSession.create({
        data: {
          classId: klass.id,
          occurredAt,
          title: input.title?.trim() || null,
          attendances: {
            create: attendances.map((a) => ({
              personId: a.personId,
              present: a.present !== false,
            })),
          },
        },
        include: { attendances: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "course.session.create",
          resourceType: "course_session",
          resourceId: session.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            classId: klass.id,
            attendanceCount: attendances.length,
          },
        },
      });
      return this.toSessionDto(session);
    });
  }

  async listSessions(actor: AuthUser, classId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertTeach(actor, pilot.organizationId, pilot.churchId);
    await this.requireClass(classId, pilot);

    const rows = await this.prisma.courseSession.findMany({
      where: { classId },
      orderBy: { occurredAt: "asc" },
      include: { attendances: true },
    });

    return {
      classId,
      sessions: rows.map((row) => this.toSessionDto(row)),
    };
  }

  private assertTeach(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    if (!canLeadMinistry(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException(
        "Sem permissão para operar cursos/EBD nesta congregação",
      );
    }
  }

  private async requirePerson(personId: string, organizationId: string) {
    if (!personId?.trim()) {
      throw new BadRequestException("personId é obrigatório");
    }
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId },
      select: { id: true },
    });
    if (!person) {
      throw new BadRequestException("Pessoa não encontrada neste escopo");
    }
    return person;
  }

  private async requireCourse(
    courseId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const row = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Curso não encontrado");
    }
    return row;
  }

  private async requireClass(
    classId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const row = await this.prisma.courseClass.findFirst({
      where: {
        id: classId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Turma não encontrada");
    }
    return row;
  }

  private async requireEnrollment(
    enrollmentId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const row = await this.prisma.courseEnrollment.findFirst({
      where: {
        id: enrollmentId,
        class: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      },
    });
    if (!row) {
      throw new NotFoundException("Matrícula não encontrada");
    }
    return row;
  }

  private requireCourseStatus(status: string): CourseStatus {
    if ((COURSE_STATUSES as readonly string[]).includes(status)) {
      return status as CourseStatus;
    }
    throw new BadRequestException(`status de curso inválido: ${status}`);
  }

  private requireEnrollmentStatus(status: string): EnrollmentStatus {
    if ((ENROLLMENT_STATUSES as readonly string[]).includes(status)) {
      return status as EnrollmentStatus;
    }
    throw new BadRequestException(`status de matrícula inválido: ${status}`);
  }

  private parseOptionalDate(value: string | undefined, field: string) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} inválido`);
    }
    return d;
  }

  private toCourseDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    code: string | null;
    name: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status as CourseStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toClassDto(row: {
    id: string;
    courseId: string;
    organizationId: string;
    churchId: string;
    name: string;
    teacherPersonId: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      courseId: row.courseId,
      organizationId: row.organizationId,
      churchId: row.churchId,
      name: row.name,
      teacherPersonId: row.teacherPersonId,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      status: row.status as ClassStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toEnrollmentDto(row: {
    id: string;
    classId: string;
    personId: string;
    status: string;
    enrolledAt: Date;
    completedAt: Date | null;
    certificateApprovedByUserId: string | null;
    certificateIssuedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      classId: row.classId,
      personId: row.personId,
      status: row.status as EnrollmentStatus,
      enrolledAt: row.enrolledAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      certificateApprovedByUserId: row.certificateApprovedByUserId,
      certificateIssuedAt: row.certificateIssuedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toSessionDto(row: {
    id: string;
    classId: string;
    title: string | null;
    occurredAt: Date;
    createdAt: Date;
    updatedAt: Date;
    attendances: Array<{
      id: string;
      sessionId: string;
      personId: string;
      present: boolean;
    }>;
  }) {
    return {
      id: row.id,
      classId: row.classId,
      title: row.title,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      attendances: row.attendances.map((a) => ({
        id: a.id,
        sessionId: a.sessionId,
        personId: a.personId,
        present: a.present,
      })),
    };
  }
}
