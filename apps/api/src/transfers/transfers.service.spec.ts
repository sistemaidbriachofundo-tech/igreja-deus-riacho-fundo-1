import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { TransfersService } from "./transfers.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("TransfersService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "RF1",
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

  it("forbids membro", async () => {
    const service = new TransfersService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(membro)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates transfer for ACTIVE membership", async () => {
    const prisma = {
      church: {
        findFirst: jest.fn().mockResolvedValue({ id: "church-other" }),
      },
      churchMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: "m1",
          personId: "p1",
          churchId: pilot.churchId,
        }),
      },
      membershipTransfer: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "t1",
          personId: "p1",
          organizationId: pilot.organizationId,
          fromChurchId: pilot.churchId,
          toChurchId: "church-other",
          fromMembershipId: "m1",
          toMembershipId: null,
          status: "AWAITING_ORIGIN",
          notes: null,
          rejectionReason: null,
          createdAt: new Date("2026-11-05T00:00:00Z"),
          completedAt: null,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: "church-other",
      }),
    ).resolves.toMatchObject({ id: "t1", status: "AWAITING_ORIGIN" });
  });

  it("404 when get missing", async () => {
    const prisma = {
      membershipTransfer: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getById(secretaria, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
