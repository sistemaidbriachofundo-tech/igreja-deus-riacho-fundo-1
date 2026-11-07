import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CoursesService } from "./courses.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("CoursesService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const lead: AuthUser = {
    userId: "u-lead",
    personId: "p-lead",
    email: "lead@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const membro: AuthUser = {
    userId: "u-m",
    personId: "p-m",
    email: "m@example.test",
    grants: [
      {
        roleCode: "MEMBRO",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-07T12:00:00Z");

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  it("forbids MEMBRO from listing courses", async () => {
    const service = new CoursesService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.listCourses(membro)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("creates course and audits (distinct from discipleship)", async () => {
    const course = {
      id: "c1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: "EBD-1",
      name: "EBD Adultos",
      description: null as string | null,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      course: { create: jest.fn().mockResolvedValue(course) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new CoursesService(
      withTx(tx) as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.createCourse(lead, {
      name: "EBD Adultos",
      code: "EBD-1",
    });
    expect(dto).toMatchObject({ id: "c1", name: "EBD Adultos", code: "EBD-1" });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "course.create" }),
      }),
    );
  });

  it("lists courses with domain marker ebd_courses", async () => {
    const prisma = {
      course: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "c1",
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            code: null,
            name: "EBD",
            description: null,
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
          },
        ]),
      },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const res = await service.listCourses(lead);
    expect(res.domain).toBe("ebd_courses");
    expect(res.distinctFrom).toBe("discipleship");
    expect(res.courses).toHaveLength(1);
  });

  it("enrolls person in OPEN class", async () => {
    const klass = {
      id: "cl1",
      courseId: "c1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      name: "Turma A",
      teacherPersonId: null,
      startsAt: null,
      endsAt: null,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    };
    const enrollment = {
      id: "e1",
      classId: "cl1",
      personId: "p1",
      status: "ENROLLED",
      enrolledAt: now,
      completedAt: null,
      certificateApprovedByUserId: null,
      certificateIssuedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      courseEnrollment: { create: jest.fn().mockResolvedValue(enrollment) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      courseClass: { findFirst: jest.fn().mockResolvedValue(klass) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.enroll(lead, "cl1", { personId: "p1" });
    expect(dto.status).toBe("ENROLLED");
  });

  it("rejects enroll on CLOSED class", async () => {
    const prisma = {
      courseClass: {
        findFirst: jest.fn().mockResolvedValue({
          id: "cl1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          status: "CLOSED",
        }),
      },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.enroll(lead, "cl1", { personId: "p1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("completes enrollment with certificate metadata", async () => {
    const enrollment = {
      id: "e1",
      classId: "cl1",
      personId: "p1",
      status: "ENROLLED",
      enrolledAt: now,
      completedAt: null as Date | null,
      certificateApprovedByUserId: null as string | null,
      certificateIssuedAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    };
    const completed = {
      ...enrollment,
      status: "COMPLETED",
      completedAt: now,
      certificateApprovedByUserId: lead.userId,
      certificateIssuedAt: now,
    };
    const tx = {
      courseEnrollment: { update: jest.fn().mockResolvedValue(completed) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      courseEnrollment: {
        findFirst: jest.fn().mockResolvedValue(enrollment),
      },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.completeEnrollment(lead, "e1", {
      issueCertificate: true,
    });
    expect(dto.status).toBe("COMPLETED");
    expect(dto.certificateApprovedByUserId).toBe(lead.userId);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "course.enrollment.complete",
        }),
      }),
    );
  });

  it("creates session with attendances", async () => {
    const klass = {
      id: "cl1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      status: "OPEN",
    };
    const session = {
      id: "s1",
      classId: "cl1",
      title: "Lição 1",
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      attendances: [
        { id: "a1", sessionId: "s1", personId: "p1", present: true },
      ],
    };
    const tx = {
      courseSession: { create: jest.fn().mockResolvedValue(session) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      courseClass: { findFirst: jest.fn().mockResolvedValue(klass) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.createSession(lead, "cl1", {
      occurredAt: now.toISOString(),
      title: "Lição 1",
      attendances: [{ personId: "p1", present: true }],
    });
    expect(dto.attendances).toHaveLength(1);
  });

  it("404 when course missing", async () => {
    const prisma = {
      course: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.listClasses(lead, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects empty course name", async () => {
    const service = new CoursesService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createCourse(lead, { name: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("filters courses by status and rejects invalid status", async () => {
    const prisma = {
      course: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await service.listCourses(lead, "ACTIVE");
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
    await expect(service.listCourses(lead, "NOPE")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("creates class with teacher and date range validation", async () => {
    const course = {
      id: "c1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    };
    const klass = {
      id: "cl1",
      courseId: "c1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      name: "Turma A",
      teacherPersonId: "p-teacher",
      startsAt: new Date("2026-11-01T00:00:00Z"),
      endsAt: new Date("2026-12-01T00:00:00Z"),
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      courseClass: { create: jest.fn().mockResolvedValue(klass) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      course: { findFirst: jest.fn().mockResolvedValue(course) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-teacher" }) },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createClass(lead, "c1", { name: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createClass(lead, "c1", {
        name: "Turma A",
        startsAt: "2026-12-01T00:00:00Z",
        endsAt: "2026-11-01T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createClass(lead, "c1", {
        name: "Turma A",
        startsAt: "not-a-date",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const dto = await service.createClass(lead, "c1", {
      name: "Turma A",
      teacherPersonId: "p-teacher",
      startsAt: "2026-11-01T00:00:00Z",
      endsAt: "2026-12-01T00:00:00Z",
    });
    expect(dto.teacherPersonId).toBe("p-teacher");
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "course.class.create" }),
      }),
    );
  });

  it("lists classes for a course", async () => {
    const course = {
      id: "c1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    };
    const klass = {
      id: "cl1",
      courseId: "c1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      name: "Turma A",
      teacherPersonId: null,
      startsAt: null,
      endsAt: null,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    };
    const prisma = {
      course: { findFirst: jest.fn().mockResolvedValue(course) },
      courseClass: { findMany: jest.fn().mockResolvedValue([klass]) },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const res = await service.listClasses(lead, "c1");
    expect(res.classes).toHaveLength(1);
    expect(res.courseId).toBe("c1");
  });

  it("lists enrollments with filters and rejects invalid enrollment status", async () => {
    const klass = {
      id: "cl1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      status: "OPEN",
    };
    const enrollment = {
      id: "e1",
      classId: "cl1",
      personId: "p1",
      status: "ENROLLED",
      enrolledAt: now,
      completedAt: null,
      certificateApprovedByUserId: null,
      certificateIssuedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const prisma = {
      courseClass: { findFirst: jest.fn().mockResolvedValue(klass) },
      courseEnrollment: {
        findMany: jest.fn().mockResolvedValue([enrollment]),
      },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const res = await service.listEnrollments(lead, {
      classId: "cl1",
      personId: "p1",
      status: "ENROLLED",
    });
    expect(res.enrollments).toHaveLength(1);
    await expect(
      service.listEnrollments(lead, { status: "NOPE" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("completeEnrollment is idempotent for COMPLETED and rejects DROPPED", async () => {
    const completed = {
      id: "e1",
      classId: "cl1",
      personId: "p1",
      status: "COMPLETED",
      enrolledAt: now,
      completedAt: now,
      certificateApprovedByUserId: null,
      certificateIssuedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const dropped = { ...completed, status: "DROPPED", completedAt: null };
    const prisma = {
      courseEnrollment: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(completed)
          .mockResolvedValueOnce(dropped),
      },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const again = await service.completeEnrollment(lead, "e1");
    expect(again.status).toBe("COMPLETED");
    await expect(service.completeEnrollment(lead, "e1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("404 when enrollment missing; rejects empty personId and missing person", async () => {
    const klass = {
      id: "cl1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      status: "OPEN",
    };
    const prisma = {
      courseEnrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      courseClass: { findFirst: jest.fn().mockResolvedValue(klass) },
      person: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.completeEnrollment(lead, "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.enroll(lead, "cl1", { personId: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.enroll(lead, "cl1", { personId: "p-missing" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("404 when class missing; lists sessions; rejects missing occurredAt", async () => {
    const klass = {
      id: "cl1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      status: "OPEN",
    };
    const session = {
      id: "s1",
      classId: "cl1",
      title: null,
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      attendances: [],
    };
    const prisma = {
      courseClass: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue(klass),
      },
      courseSession: { findMany: jest.fn().mockResolvedValue([session]) },
    };
    const service = new CoursesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.listSessions(lead, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const listed = await service.listSessions(lead, "cl1");
    expect(listed.sessions).toHaveLength(1);
    await expect(
      service.createSession(lead, "cl1", { occurredAt: "" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
