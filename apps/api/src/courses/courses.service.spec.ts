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
});
