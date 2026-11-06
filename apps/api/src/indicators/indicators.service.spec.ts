import { ForbiddenException } from "@nestjs/common";
import { IndicatorsService } from "./indicators.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("IndicatorsService", () => {
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

  function prismaStub() {
    return {
      churchMembership: {
        count: jest.fn().mockResolvedValue(2),
        groupBy: jest.fn().mockResolvedValue([
          { status: "ACTIVE", _count: { _all: 3 } },
          { status: "PENDING_ADMISSION", _count: { _all: 1 } },
        ]),
      },
      admissionProtocol: {
        count: jest.fn().mockResolvedValue(0),
      },
      membershipTransfer: {
        count: jest.fn().mockResolvedValue(0),
      },
      pastoralCase: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
  }

  it("returns church-scoped summary stub for secretaria", async () => {
    const prisma = prismaStub();
    const service = new IndicatorsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.summary(secretaria);
    expect(result.stub).toBe(true);
    expect(result.scope).toBe("church");
    expect(result.churchId).toBe("church-rf1");
    expect(result.counts.membershipsActive).toBe(2);
  });

  it("allows PLATFORM_ADMIN org-wide summary via scope=organization", async () => {
    const prisma = prismaStub();
    const service = new IndicatorsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.summary(platformAdmin, {
      scope: "organization",
    });
    expect(result.scope).toBe("organization");
    expect(result.churchId).toBeNull();
  });

  it("forbids membership indicators outside grant", async () => {
    const service = new IndicatorsService(
      prismaStub() as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.membership(secretaria, "church-other"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns membership byStatus stub", async () => {
    const prisma = prismaStub();
    const service = new IndicatorsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.membership(secretaria);
    expect(result.stub).toBe(true);
    expect(result.byStatus.ACTIVE).toBe(3);
    expect(result.byStatus.PENDING_ADMISSION).toBe(1);
  });
});
