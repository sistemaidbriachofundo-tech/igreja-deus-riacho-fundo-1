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
    grants: [
      {
        roleCode: "MEMBRO",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  it("lists recent logs for secretaria", async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "l1",
            action: "admission.create",
            resourceType: "admission_protocol",
            resourceId: "a1",
            actorUserId: "u-sec",
            metadata: { ok: true },
            createdAt: new Date("2026-11-04T12:00:00Z"),
          },
        ]),
      },
    };
    const service = new AuditService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listRecent(secretaria, 10);
    expect(result.logs).toHaveLength(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
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
