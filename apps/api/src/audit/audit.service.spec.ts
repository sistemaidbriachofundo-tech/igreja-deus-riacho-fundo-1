import { ForbiddenException } from "@nestjs/common";
import { AuditService } from "./audit.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("AuditService", () => {
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

  const member: AuthUser = {
    userId: "u-mem",
    personId: "p-mem",
    email: "bruno.demo@example.test",
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "MEMBRO",
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

  const sampleRow = {
    id: "l1",
    action: "admission.create",
    resourceType: "admission_protocol",
    resourceId: "a1",
    actorUserId: "u-sec",
    metadata: { ok: true },
    createdAt: new Date("2026-11-04T12:00:00Z"),
    churchId: "church-rf1",
  };

  it("lists recent logs for secretaria (church default RF1)", async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([sampleRow]),
      },
    };
    const service = new AuditService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listRecent(secretaria, 10);
    expect(result.logs).toHaveLength(1);
    expect(result.scope).toBe("church");
    expect(result.churchId).toBe("church-rf1");
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        where: expect.objectContaining({
          organizationId: "org1",
          churchId: "church-rf1",
        }),
      }),
    );
  });

  it("PLATFORM_ADMIN cross-church with scope=organization", async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          sampleRow,
          { ...sampleRow, id: "l2", churchId: "church-rf2" },
        ]),
      },
    };
    const service = new AuditService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listRecent(platformAdmin, 50, {
      scope: "organization",
    });
    expect(result.scope).toBe("organization");
    expect(result.churchId).toBeNull();
    expect(result.logs).toHaveLength(2);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org1" },
      }),
    );
  });

  it("forbids secretaria from org-wide scope", async () => {
    const service = new AuditService(
      { auditLog: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.listRecent(secretaria, 50, { scope: "organization" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("forbids membro", async () => {
    const service = new AuditService(
      { auditLog: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.listRecent(member)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
