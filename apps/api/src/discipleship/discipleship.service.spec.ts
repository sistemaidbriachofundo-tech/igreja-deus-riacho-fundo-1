import { ForbiddenException } from "@nestjs/common";
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
        create: jest.fn().mockResolvedValue({
          id: "t1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name: "Fundamentos",
          description: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new DiscipleshipService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.createTrack(lider, {
      name: " Fundamentos ",
    });
    expect(result.id).toBe("t1");
    expect(result.name).toBe("Fundamentos");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
