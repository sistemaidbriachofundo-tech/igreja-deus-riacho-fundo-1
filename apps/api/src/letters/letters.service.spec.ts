import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { LettersService } from "./letters.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("LettersService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
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

  const pastor: AuthUser = {
    userId: "u-pas",
    personId: "p-pas",
    email: "pastor.demo@example.test",
    grants: [
      {
        roleCode: "PASTOR",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-05T00:00:00Z");

  const draftLetter = {
    id: "L1",
    personId: "p1",
    letterType: "RECOMENDACAO",
    status: "DRAFT",
    title: "Carta",
    bodyText: "Texto",
    version: 1,
    supersedesId: null as string | null,
    issuedAt: null as Date | null,
    revokedAt: null as Date | null,
    createdAt: now,
    storageKey: null as string | null,
    pdfContentType: null as string | null,
    pdfByteSize: null as number | null,
    pdfGeneratedAt: null as Date | null,
  };

  const storage = {
    buildLetterPdfKey: jest.fn().mockReturnValue("letters/org1/church-rf1/L1/x.pdf"),
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4 demo")),
    remove: jest.fn().mockResolvedValue(undefined),
    contentSha256: jest.fn().mockReturnValue("abc"),
  };

  function buildService(prisma: Record<string, unknown>) {
    return new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("forbids pastor from issuing letters", async () => {
    const service = buildService({});
    await expect(service.list(pastor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists letters optionally filtered by personId", async () => {
    const prisma = {
      churchLetter: {
        findMany: jest.fn().mockResolvedValue([draftLetter]),
      },
    };
    const service = buildService(prisma);

    const all = await service.list(secretaria);
    expect(all.letters).toHaveLength(1);
    expect(all.letters[0]?.pdf?.hasFile).toBe(false);
    expect(prisma.churchLetter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        }),
      }),
    );

    await service.list(secretaria, "p1");
    expect(prisma.churchLetter.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ personId: "p1" }),
      }),
    );
  });

  it("creates versioned draft letter", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue({ id: "old", version: 1 }),
        create: jest.fn().mockResolvedValue({
          id: "L2",
          personId: "p1",
          letterType: "RECOMENDACAO",
          status: "DRAFT",
          title: "Carta",
          bodyText: "Texto",
          version: 2,
          supersedesId: "old",
          issuedAt: null,
          revokedAt: null,
          createdAt: now,
          storageKey: null,
          pdfContentType: null,
          pdfByteSize: null,
          pdfGeneratedAt: null,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);
    await expect(
      service.create(secretaria, {
        personId: "p1",
        letterType: "RECOMENDACAO",
        title: "Carta",
        bodyText: "Texto",
      }),
    ).resolves.toMatchObject({ id: "L2", version: 2, status: "DRAFT" });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("creates first version when no previous letter", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(draftLetter),
      },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);
    const result = await service.create(secretaria, {
      personId: "p1",
      letterType: "MEMBRESIA",
      title: "  Carta  ",
      bodyText: "  Texto  ",
    });
    expect(result.version).toBe(1);
    expect(prisma.churchLetter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          supersedesId: null,
          letterType: "MEMBRESIA",
        }),
      }),
    );
  });

  it("rejects create validation errors", async () => {
    const prisma = {
      person: { findFirst: jest.fn() },
      churchLetter: { findFirst: jest.fn(), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);

    await expect(
      service.create(secretaria, {
        personId: "p1",
        letterType: "INVALID",
        title: "t",
        bodyText: "b",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(secretaria, {
        personId: "p1",
        letterType: "OUTRO",
        title: " ",
        bodyText: "b",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.person.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(secretaria, {
        personId: "missing",
        letterType: "TRANSFERENCIA",
        title: "t",
        bodyText: "b",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("issues draft letter", async () => {
    const issued = {
      ...draftLetter,
      status: "ISSUED",
      issuedAt: now,
    };
    const prisma = {
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue(draftLetter),
        update: jest.fn().mockResolvedValue(issued),
      },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);
    const result = await service.issue(secretaria, "L1");
    expect(result.status).toBe("ISSUED");
    expect(result.issuedAt).toBe(now.toISOString());
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "letter.issue" }),
      }),
    );
  });

  it("rejects issue when missing or not draft", async () => {
    const prisma = {
      churchLetter: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ...draftLetter, status: "ISSUED" }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);

    await expect(service.issue(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.issue(secretaria, "L1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("revokes issued letter", async () => {
    const issued = { ...draftLetter, status: "ISSUED", issuedAt: now };
    const revoked = {
      ...issued,
      status: "REVOKED",
      revokedAt: now,
    };
    const prisma = {
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue(issued),
        update: jest.fn().mockResolvedValue(revoked),
      },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);
    const result = await service.revoke(secretaria, "L1");
    expect(result.status).toBe("REVOKED");
    expect(result.revokedAt).toBe(now.toISOString());
  });

  it("rejects revoke when missing or not issued", async () => {
    const prisma = {
      churchLetter: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(draftLetter),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);

    await expect(service.revoke(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.revoke(secretaria, "L1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("generatePdf stores storageKey and audits without person email", async () => {
    const prisma = {
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue({
          ...draftLetter,
          status: "ISSUED",
          issuedAt: now,
          person: { displayName: "Bruno Demo", email: "bruno.demo@example.test" },
        }),
        update: jest.fn().mockResolvedValue({
          ...draftLetter,
          status: "ISSUED",
          issuedAt: now,
          storageKey: "letters/org1/church-rf1/L1/x.pdf",
          pdfContentType: "application/pdf",
          pdfByteSize: 1200,
          pdfGeneratedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);
    const dto = await service.generatePdf(secretaria, "L1");
    expect(dto.pdf?.hasFile).toBe(true);
    expect(storage.put).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "letter.pdf.generate",
          metadata: expect.not.objectContaining({
            email: expect.anything(),
          }),
        }),
      }),
    );
  });

  it("downloadPdf and pdf-meta require generated file", async () => {
    const prisma = {
      churchLetter: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ ...draftLetter })
          .mockResolvedValueOnce({
            ...draftLetter,
            storageKey: "letters/x.pdf",
            pdfContentType: "application/pdf",
            pdfByteSize: 900,
            pdfGeneratedAt: now,
          })
          .mockResolvedValueOnce({
            ...draftLetter,
            storageKey: "letters/x.pdf",
            pdfContentType: "application/pdf",
            pdfByteSize: 900,
            pdfGeneratedAt: now,
          }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = buildService(prisma);

    await expect(service.downloadPdf(secretaria, "L1")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const file = await service.downloadPdf(secretaria, "L1");
    expect(file.contentType).toBe("application/pdf");
    expect(file.bytes.toString()).toContain("%PDF");

    const meta = await service.getPdfMeta(secretaria, "L1");
    expect(meta).toMatchObject({
      letterId: "L1",
      hasFile: true,
      contentType: "application/pdf",
      byteSize: 900,
    });
  });
});
