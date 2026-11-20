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

  it("aceita DOCX com assinatura e recusa DOC disfarçado", async () => {
    const prisma = {
      admissionProtocol: { findFirst: jest.fn().mockResolvedValue({ id: "adm1", modality: "BATISMO" }) },
      admissionDocument: { create: jest.fn().mockResolvedValue({ id: "doc", displayName: "ficha.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteSize: 8, createdAt: new Date() }), findMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const storage = { buildAdmissionKey: jest.fn().mockReturnValue("admissions/org/church/adm/file.docx"), put: jest.fn(), contentSha256: jest.fn().mockReturnValue("c".repeat(64)), get: jest.fn().mockResolvedValue(Buffer.from([0x50, 0x4b, 0x03, 0x04])) };
    const service = new AdmissionDocumentsService(prisma as never, { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never, storage as never);
    const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    await expect(service.upload(secretaria, "adm1", {
      originalname: "ficha.docx",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
      size: docx.length,
    })).resolves.toMatchObject({ displayName: "ficha.docx" });
    expect(storage.put).toHaveBeenCalledWith("admissions/org/church/adm/file.docx", docx);
    await expect(service.upload(secretaria, "adm1", {
      originalname: "falso.docx",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("nao-e-zip"),
      size: 9,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

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

  it("downloads document for pastor role path via secretaria actor", async () => {
    const prisma = {
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue({ id: "adm1" }),
      },
      admissionDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: "doc1",
          admissionId: "adm1",
          organizationId: "org1",
          churchId: "church-rf1",
          displayName: "doc.pdf",
          contentType: "application/pdf",
          storageKey: "admissions/org1/church-rf1/adm1/x",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const storage = {
      get: jest.fn().mockResolvedValue(Buffer.from("%PDF")),
    };
    const service = new AdmissionDocumentsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    const file = await service.download(secretaria, "adm1", "doc1");
    expect(file.contentType).toBe("application/pdf");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("deletes document metadata and private bytes for secretaria", async () => {
    const prisma = {
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue({ id: "adm1" }),
      },
      admissionDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: "doc1",
          admissionId: "adm1",
          organizationId: "org1",
          churchId: "church-rf1",
          contentType: "application/pdf",
          byteSize: 4,
          storageKey: "admissions/org1/church-rf1/adm1/x",
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn() },
    };
    const storage = {
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdmissionDocumentsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );

    await expect(service.remove(member, "adm1", "doc1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const result = await service.remove(secretaria, "adm1", "doc1");
    expect(result).toEqual({ deleted: true, id: "doc1", admissionId: "adm1" });
    expect(prisma.admissionDocument.delete).toHaveBeenCalledWith({
      where: { id: "doc1" },
    });
    expect(storage.remove).toHaveBeenCalledWith(
      "admissions/org1/church-rf1/adm1/x",
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "admission_document.delete",
        }),
      }),
    );
  });

  it("vincula o arquivo privado ao requisito e mantém o anexo histórico", async () => {
    const pastor: AuthUser = {
      ...secretaria,
      userId: "u-pastor",
      grants: [{ roleCode: "PASTOR", organizationId: "org1", churchId: "church-rf1" }],
    };
    const requirement = {
      id: "req-1", modality: "BATISMO", code: "carta-ficticia", label: "Carta fictícia",
      required: true, active: true, sortOrder: 0, updatedAt: new Date("2026-11-19T12:00:00Z"),
    };
    const prisma = {
      admissionProtocol: { findFirst: jest.fn().mockResolvedValue({ id: "adm1", modality: "BATISMO" }) },
      admissionDocumentRequirement: {
        findFirst: jest.fn(async ({ where }: { where: { id?: string } }) => where.id ? requirement : null),
        findMany: jest.fn().mockResolvedValue([requirement]),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...requirement, ...data })),
      },
      admissionDocument: {
        create: jest.fn().mockResolvedValue({
          id: "doc1", admissionId: "adm1", displayName: "carta.pdf", contentType: "application/pdf",
          byteSize: 4, requirementId: "req-1", createdAt: new Date("2026-11-19T12:00:00Z"),
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: "legacy", admissionId: "adm1", displayName: "antigo.pdf", contentType: "application/pdf", byteSize: 2, requirementId: null, createdAt: new Date("2026-11-01T12:00:00Z") },
          { id: "doc1", admissionId: "adm1", displayName: "carta.pdf", contentType: "application/pdf", byteSize: 4, requirementId: "req-1", createdAt: new Date("2026-11-19T12:00:00Z") },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: "doc1", admissionId: "adm1", organizationId: "org1", churchId: "church-rf1",
          displayName: "carta.pdf", contentType: "application/pdf", storageKey: "privado/carta",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const storage = {
      buildAdmissionKey: jest.fn().mockReturnValue("privado/carta"),
      put: jest.fn(), contentSha256: jest.fn().mockReturnValue("c".repeat(64)),
      get: jest.fn().mockResolvedValue(Buffer.from("%PDF")),
    };
    const service = new AdmissionDocumentsService(prisma as never, { getPilotChurch: async () => pilot } as never, storage as never);

    await expect(service.createRequirement(pastor, { modality: "BATISMO", code: "carta-ficticia", label: "Carta fictícia", required: true }))
      .rejects.toBeInstanceOf(ForbiddenException);
    const created = await service.createRequirement(secretaria, { modality: "BATISMO", code: "carta-ficticia", label: "Carta fictícia", required: true });
    expect(created.required).toBe(true);
    const uploaded = await service.upload(secretaria, "adm1", {
      originalname: "carta.pdf", mimetype: "application/pdf", buffer: Buffer.from("%PDF"), size: 4,
    }, "req-1");
    expect(uploaded.requirementId).toBe("req-1");
    expect(storage.put).toHaveBeenCalledWith("privado/carta", expect.any(Buffer));
    const listed = await service.list(pastor, "adm1");
    expect(listed.documents.map((item) => item.requirementId)).toEqual([null, "req-1"]);
    expect(listed.requirements).toEqual([expect.objectContaining({ id: "req-1", satisfied: true })]);
    const file = await service.download(pastor, "adm1", "doc1");
    expect(file.bytes.equals(Buffer.from("%PDF"))).toBe(true);
    await expect(service.download(member, "adm1", "doc1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "admission_document.download", metadata: { admissionId: "adm1" } }),
    }));
  });
});
