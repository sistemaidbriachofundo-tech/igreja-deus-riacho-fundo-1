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
});
