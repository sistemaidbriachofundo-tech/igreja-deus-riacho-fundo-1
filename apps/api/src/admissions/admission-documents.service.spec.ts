import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AdmissionDocumentsService } from "./admission-documents.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("AdmissionDocumentsService", () => {
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

  it("rejects upload for membro and bad mime", async () => {
    const prisma = {
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue({ id: "adm1" }),
      },
      admissionDocument: { create: jest.fn(), findMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const storage = {
      buildAdmissionKey: jest.fn().mockReturnValue("k"),
      put: jest.fn(),
      contentSha256: jest.fn().mockReturnValue("a".repeat(64)),
    };
    const service = new AdmissionDocumentsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );

    await expect(
      service.upload(member, "adm1", {
        originalname: "x.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.from("x"),
        size: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.upload(secretaria, "adm1", {
        originalname: "x.exe",
        mimetype: "application/octet-stream",
        buffer: Buffer.from("x"),
        size: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uploads allowed pdf and lists", async () => {
    const prisma = {
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue({ id: "adm1" }),
      },
      admissionDocument: {
        create: jest.fn().mockResolvedValue({
          id: "doc1",
          admissionId: "adm1",
          displayName: "doc.pdf",
          contentType: "application/pdf",
          byteSize: 4,
          createdAt: new Date("2026-11-04T12:00:00Z"),
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: { create: jest.fn() },
    };
    const storage = {
      buildAdmissionKey: jest.fn().mockReturnValue("k"),
      put: jest.fn(),
      contentSha256: jest.fn().mockReturnValue("b".repeat(64)),
      get: jest.fn(),
    };
    const service = new AdmissionDocumentsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );

    const meta = await service.upload(secretaria, "adm1", {
      originalname: "../../doc.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF"),
      size: 4,
    });
    expect(meta.displayName).not.toMatch(/[/\\]/);
    expect(meta.displayName).toContain("doc.pdf");
    expect(storage.put).toHaveBeenCalled();
    await expect(service.list(secretaria, "adm1")).resolves.toMatchObject({
      admissionId: "adm1",
    });
  });
});
