import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { DiscipleshipService } from "./discipleship.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("DiscipleshipService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const lider: AuthUser = {
    userId: "u-lider",
    personId: "p-lider",
    email: "lider.demo@example.test",
    grants: [
      {
        roleCode: "LIDER_MINISTERIO",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const membro: AuthUser = {
    userId: "u-mem",
    personId: "p-mem",
    email: "bruno.demo@example.test",
    grants: [
      {
        roleCode: "MEMBRO",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-05T12:00:00Z");

  const trackRow = {
    id: "t1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    name: "Fundamentos",
    description: "desc",
    createdAt: now,
    updatedAt: now,
  };

  const enrollmentRow = {
    id: "e1",
    trackId: "t1",
    personId: "p1",
    mentorPersonId: "p-mentor" as string | null,
    status: "ACTIVE",
    startedAt: now,
    completedAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
  };

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  it("forbids MEMBRO from creating tracks", async () => {
    const service = new DiscipleshipService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createTrack(membro, { name: "Fundamentos" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates track for líder and audits", async () => {
    const tx = {
      discipleshipTrack: {
        create: jest.fn().mockResolvedValue({ ...trackRow, description: null }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = withTx(tx);
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.createTrack(lider, {
      name: " Fundamentos ",
      description: "  intro  ",
    });
    expect(result.id).toBe("t1");
    expect(result.name).toBe("Fundamentos");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("rejects empty track name", async () => {
    const service = new DiscipleshipService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createTrack(lider, { name: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists tracks", async () => {
    const prisma = {
      discipleshipTrack: {
        findMany: jest.fn().mockResolvedValue([trackRow]),
      },
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listTracks(lider);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].description).toBe("desc");
  });

  it("forbids MEMBRO from listing tracks", async () => {
    const service = new DiscipleshipService(
      { discipleshipTrack: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.listTracks(membro)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("enrolls person with mentor and audits", async () => {
    const tx = {
      discipleshipEnrollment: {
        create: jest.fn().mockResolvedValue(enrollmentRow),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      discipleshipTrack: { findFirst: jest.fn().mockResolvedValue(trackRow) },
      person: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "p1" })
          .mockResolvedValueOnce({ id: "p-mentor" }),
      },
      ...withTx(tx),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.enroll(lider, {
      trackId: "t1",
      personId: "p1",
      mentorPersonId: "p-mentor",
    });
    expect(result.id).toBe("e1");
    expect(result.mentorPersonId).toBe("p-mentor");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("rejects enroll validation errors", async () => {
    const prisma = {
      discipleshipTrack: { findFirst: jest.fn() },
      person: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.enroll(lider, { trackId: "", personId: "p1" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.discipleshipTrack.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.enroll(lider, { trackId: "missing", personId: "p1" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.discipleshipTrack.findFirst.mockResolvedValueOnce(trackRow);
    prisma.person.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.enroll(lider, { trackId: "t1", personId: "p-missing" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.discipleshipTrack.findFirst.mockResolvedValueOnce(trackRow);
    prisma.person.findFirst
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce(null);
    await expect(
      service.enroll(lider, {
        trackId: "t1",
        personId: "p1",
        mentorPersonId: "p-missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enrolls without mentor", async () => {
    const tx = {
      discipleshipEnrollment: {
        create: jest.fn().mockResolvedValue({
          ...enrollmentRow,
          mentorPersonId: null,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      discipleshipTrack: { findFirst: jest.fn().mockResolvedValue(trackRow) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      ...withTx(tx),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.enroll(lider, {
      trackId: "t1",
      personId: "p1",
    });
    expect(result.mentorPersonId).toBeNull();
  });

  it("updates enrollment status to COMPLETED and rejects invalid/missing", async () => {
    const completedAt = new Date("2026-11-20T00:00:00Z");
    const tx = {
      discipleshipEnrollment: {
        update: jest.fn().mockResolvedValue({
          ...enrollmentRow,
          status: "COMPLETED",
          completedAt,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      discipleshipEnrollment: {
        findFirst: jest.fn().mockResolvedValue({
          ...enrollmentRow,
          track: {
            id: "t1",
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
          },
        }),
      },
      ...withTx(tx),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.updateEnrollmentStatus(lider, "e1", "NOPE"),
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await service.updateEnrollmentStatus(
      lider,
      "e1",
      "COMPLETED",
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.completedAt).toBe(completedAt.toISOString());
  });

  it("404s enrollment outside pilot church", async () => {
    const prisma = {
      discipleshipEnrollment: {
        findFirst: jest.fn().mockResolvedValue({
          ...enrollmentRow,
          track: {
            id: "t1",
            organizationId: "other-org",
            churchId: "other-church",
          },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.updateEnrollmentStatus(lider, "e1", "PAUSED"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("clears completedAt when status is not COMPLETED", async () => {
    const tx = {
      discipleshipEnrollment: {
        update: jest.fn().mockImplementation(async ({ data }) => {
          expect(data.completedAt).toBeNull();
          return { ...enrollmentRow, status: data.status, completedAt: null };
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      discipleshipEnrollment: {
        findFirst: jest.fn().mockResolvedValue({
          ...enrollmentRow,
          track: {
            id: "t1",
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
          },
        }),
      },
      ...withTx(tx),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.updateEnrollmentStatus(lider, "e1", "PAUSED");
    expect(result.status).toBe("PAUSED");
    expect(result.completedAt).toBeNull();
  });

  const stageRow = {
    id: "s1",
    trackId: "t1",
    sortOrder: 1,
    code: "INTRO",
    title: "Introdução",
    description: "primeira etapa",
    createdAt: now,
    updatedAt: now,
  };

  it("creates stage with auto sortOrder and audits", async () => {
    const tx = {
      discipleshipTrackStage: {
        create: jest.fn().mockResolvedValue(stageRow),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      discipleshipTrack: { findFirst: jest.fn().mockResolvedValue(trackRow) },
      discipleshipTrackStage: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 2 } }),
      },
      ...withTx(tx),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.createStage(lider, "t1", {
      title: " Introdução ",
      code: "INTRO",
    });
    expect(result.id).toBe("s1");
    expect(tx.discipleshipTrackStage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 3, title: "Introdução" }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("rejects empty stage title and missing track", async () => {
    const prisma = {
      discipleshipTrack: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(trackRow),
      },
      discipleshipTrackStage: { aggregate: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.createStage(lider, "missing", { title: "X" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.createStage(lider, "t1", { title: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists stages ordered", async () => {
    const prisma = {
      discipleshipTrack: { findFirst: jest.fn().mockResolvedValue(trackRow) },
      discipleshipTrackStage: {
        findMany: jest.fn().mockResolvedValue([stageRow]),
      },
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listStages(lider, "t1");
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].code).toBe("INTRO");
  });

  it("lists enrollments scoped to pilot church", async () => {
    const prisma = {
      discipleshipEnrollment: {
        findMany: jest.fn().mockResolvedValue([enrollmentRow]),
      },
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listEnrollments(lider, {
      trackId: "t1",
      status: "ACTIVE",
    });
    expect(result.enrollments).toHaveLength(1);
    expect(prisma.discipleshipEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trackId: "t1",
          status: "ACTIVE",
          track: {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
          },
        }),
      }),
    );
  });

  it("records progress event and returns history summary", async () => {
    const eventRow = {
      id: "pe1",
      enrollmentId: "e1",
      stageId: "s1",
      kind: "COMPLETED",
      note: "ok",
      recordedByUserId: lider.userId,
      recordedAt: now,
      createdAt: now,
    };
    const enrollmentScoped = {
      ...enrollmentRow,
      track: {
        id: "t1",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    };
    const tx = {
      discipleshipProgressEvent: {
        create: jest.fn().mockResolvedValue(eventRow),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      discipleshipEnrollment: {
        findFirst: jest.fn().mockResolvedValue(enrollmentScoped),
      },
      discipleshipTrackStage: {
        findFirst: jest.fn().mockResolvedValue(stageRow),
        findMany: jest.fn().mockResolvedValue([
          stageRow,
          { ...stageRow, id: "s2", sortOrder: 2, code: "BASE", title: "Bases" },
        ]),
      },
      discipleshipProgressEvent: {
        findMany: jest.fn().mockResolvedValue([eventRow]),
      },
      ...withTx(tx),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const recorded = await service.recordProgress(lider, "e1", {
      stageId: "s1",
      kind: "COMPLETED",
      note: " ok ",
    });
    expect(recorded.kind).toBe("COMPLETED");
    expect(tx.auditLog.create).toHaveBeenCalled();

    const progress = await service.getProgress(lider, "e1");
    expect(progress.spiritualScoreExcluded).toBe(true);
    expect(progress.completedStageCount).toBe(1);
    expect(progress.totalStageCount).toBe(2);
    expect(progress.currentStageId).toBe("s2");
    expect(progress.history).toHaveLength(1);
  });

  it("rejects invalid progress kind / foreign stage / long note", async () => {
    const enrollmentScoped = {
      ...enrollmentRow,
      track: {
        id: "t1",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    };
    const prisma = {
      discipleshipEnrollment: {
        findFirst: jest.fn().mockResolvedValue(enrollmentScoped),
      },
      discipleshipTrackStage: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.recordProgress(lider, "e1", { stageId: "s1", kind: "BLESSED" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.recordProgress(lider, "e1", {
        stageId: "s-other",
        kind: "STARTED",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.recordProgress(lider, "e1", {
        stageId: "s1",
        kind: "STARTED",
        note: "x".repeat(281),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("forbids MEMBRO from recording progress", async () => {
    const service = new DiscipleshipService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.recordProgress(membro, "e1", {
        stageId: "s1",
        kind: "STARTED",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
