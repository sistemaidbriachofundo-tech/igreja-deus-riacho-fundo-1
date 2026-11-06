import { ForbiddenException } from "@nestjs/common";
import { ChurchesService } from "./churches.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("ChurchesService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const secretariaRf1: AuthUser = {
    userId: "u-sec",
    personId: "p-sec",
    email: "ana.demo@example.test",
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const platformAdmin: AuthUser = {
    userId: "u-plat",
    personId: "p-plat",
    email: "platform.demo@example.test",
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "PLATFORM_ADMIN",
        organizationId: "org1",
        churchId: null,
      },
    ],
  };

  it("lists only churches covered by grants", async () => {
    const prisma = {
      church: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "church-rf1",
            organizationId: "org1",
            slug: "riacho-fundo-1",
            name: "Riacho Fundo I (demo)",
          },
        ]),
      },
    };
    const service = new ChurchesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listAccessible(secretariaRf1);
    expect(result.churches).toHaveLength(1);
    expect(result.churches[0]?.isPilotDefault).toBe(true);
    expect(prisma.church.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org1",
          id: { in: ["church-rf1"] },
        }),
      }),
    );
  });

  it("lists all org churches for org-wide PLATFORM_ADMIN", async () => {
    const prisma = {
      church: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "church-rf1",
            organizationId: "org1",
            slug: "riacho-fundo-1",
            name: "Riacho Fundo I (demo)",
          },
          {
            id: "church-rf2",
            organizationId: "org1",
            slug: "riacho-fundo-2-demo",
            name: "Riacho Fundo II (demo destino)",
          },
        ]),
      },
    };
    const service = new ChurchesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listAccessible(platformAdmin);
    expect(result.churches).toHaveLength(2);
    expect(prisma.church.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org1" },
      }),
    );
  });

  it("forbids actor without org grants", async () => {
    const service = new ChurchesService(
      { church: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.listAccessible({
        userId: "u",
        personId: "p",
        email: "x@test",
        grants: [],
        organizationId: null,
        churchId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
