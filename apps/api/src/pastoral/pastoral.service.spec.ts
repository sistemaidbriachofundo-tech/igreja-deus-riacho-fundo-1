import { ForbiddenException } from "@nestjs/common";
import { PastoralService } from "./pastoral.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("PastoralService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const pastor: AuthUser = {
    userId: "u-pastor",
    personId: "p-pastor",
    email: "pastor.demo@example.test",
    grants: [
      {
        roleCode: "PASTOR",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const secretaria: AuthUser = {
    userId: "u-sec",
    personId: "p-sec",
    email: "ana.demo@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-05T12:00:00Z");

  it("forbids SECRETARIA from creating pastoral cases", async () => {
    const service = new PastoralService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        personId: "p1",
        kind: "VISITA",
        title: "Visita",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("forbids PLATFORM_ADMIN from pastoral care by default", async () => {
    const admin: AuthUser = {
      userId: "u-admin",
      personId: "p-admin",
      email: "admin@example.test",
      grants: [
        {
          roleCode: "PLATFORM_ADMIN",
          organizationId: "org1",
          churchId: "church-rf1",
        },
      ],
    };
    const service = new PastoralService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates pastoral case for pastor and audits", async () => {
    const tx = {
      pastoralCase: {
        create: jest.fn().mockResolvedValue({
          id: "pc1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          personId: "p1",
          kind: "VISITA",
          status: "OPEN",
          title: "Visita",
          summary: null,
          assignedToUserId: null,
          createdByUserId: pastor.userId,
          dueAt: null,
          closedAt: null,
          createdAt: now,
          updatedAt: now,
          tasks: [],
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: "p1" }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.create(pastor, {
      personId: "p1",
      kind: "VISITA",
      title: " Visita ",
    });
    expect(result.id).toBe("pc1");
    expect(result.title).toBe("Visita");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("forbids SECRETARIA from listing cases", async () => {
    const service = new PastoralService(
      { pastoralCase: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(secretaria)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
