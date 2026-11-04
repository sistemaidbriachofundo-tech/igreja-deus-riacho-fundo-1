import { ForbiddenException } from "@nestjs/common";
import { MembershipsService } from "./memberships.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("MembershipsService scope", () => {
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

  const memberOnly: AuthUser = {
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

  const otherChurchSec: AuthUser = {
    userId: "u-other",
    personId: "p-other",
    email: "other@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-other",
      },
    ],
  };

  function buildService(listImpl?: () => unknown) {
    const prisma = {
      churchMembership: {
        findMany: jest.fn().mockImplementation(listImpl ?? (async () => [])),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      person: { findFirst: jest.fn(), create: jest.fn() },
      household: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const pilotService = {
      getPilotChurch: jest.fn().mockResolvedValue(pilot),
    };
    return {
      service: new MembershipsService(
        prisma as never,
        pilotService as never,
      ),
      prisma,
      pilotService,
    };
  }

  it("lists memberships for SECRETARIA no piloto", async () => {
    const { service, prisma } = buildService(async () => [
      {
        id: "m1",
        status: "ACTIVE",
        joinedAt: new Date("2026-01-01"),
        notes: null,
        person: {
          id: "p-mem",
          displayName: "Bruno Demo",
          email: "bruno.demo@example.test",
          status: "ACTIVE",
          householdId: null,
        },
        credentials: [],
        admissions: [{ id: "adm1" }],
      },
    ]);

    const result = await service.listForPilot(secretaria);
    expect(result.church.slug).toBe("riacho-fundo-1");
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0]?.admissionId).toBe("adm1");
    expect(prisma.churchMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          churchId: "church-rf1",
          organizationId: "org1",
        },
      }),
    );
  });

  it("rejects MEMBRO listing memberships", async () => {
    const { service } = buildService();
    await expect(service.listForPilot(memberOnly)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects SECRETARIA de outra congregação", async () => {
    const { service } = buildService();
    await expect(service.listForPilot(otherChurchSec)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
