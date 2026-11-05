import { ForbiddenException } from "@nestjs/common";
import { GroupsService } from "./groups.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("GroupsService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
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

  it("forbids MEMBRO from creating small groups", async () => {
    const service = new GroupsService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(membro, { name: "Célula Norte" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates small group for secretaria and audits", async () => {
    const tx = {
      smallGroup: {
        create: jest.fn().mockResolvedValue({
          id: "g1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name: "Célula Norte",
          leaderPersonId: null,
          meetsAtHint: null,
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
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.create(secretaria, {
      name: " Célula Norte ",
    });
    expect(result.id).toBe("g1");
    expect(result.name).toBe("Célula Norte");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
