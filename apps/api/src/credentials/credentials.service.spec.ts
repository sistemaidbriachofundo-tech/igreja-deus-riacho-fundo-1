import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  containsSensitiveCredentialPayload,
  generateOpaqueCredentialToken,
  isOpaqueCredentialToken,
} from "@idbrf/shared";
import { CredentialsService } from "./credentials.service";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";

describe("CredentialsService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const opaqueToken = generateOpaqueCredentialToken();

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

  function prismaWithEligibility(eligible: boolean) {
    return {
      churchMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: "m1",
          personId: "p-mem",
          status: "ACTIVE",
          person: { id: "p-mem", displayName: "Bruno Demo" },
        }),
      },
      admissionProtocol: {
        findFirst: jest
          .fn()
          .mockResolvedValue(eligible ? { id: "adm1", status: "APPROVED" } : null),
      },
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "c1",
          ...data,
          issuedAt: new Date("2026-11-04T12:00:00Z"),
          revokedAt: null,
        })),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
  }

  const storage = {
    buildCredentialPdfKey: jest.fn().mockReturnValue("credentials/org1/church/c1/x.pdf"),
    put: jest.fn(),
    get: jest.fn(),
    remove: jest.fn(),
    contentSha256: jest.fn().mockReturnValue("abc"),
  };

  it("issues card with opaque QR when admission APPROVED", async () => {
    const prisma = prismaWithEligibility(true);
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );

    const card = await service.issue(secretaria, "m1");
    expect(isOpaqueCredentialToken(card.qrPayload)).toBe(true);
    expect(containsSensitiveCredentialPayload(card.qrPayload)).toBe(false);
    expect(card.displayName).toBe("Bruno Demo");
  });

  it("blocks issue when not eligible / membership missing / conflict", async () => {
    const ineligible = prismaWithEligibility(false);
    const serviceA = new CredentialsService(
      ineligible as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    await expect(serviceA.issue(secretaria, "m1")).rejects.toBeInstanceOf(
      BusinessException,
    );

    const missing = prismaWithEligibility(true);
    missing.churchMembership.findFirst.mockResolvedValue(null);
    const serviceB = new CredentialsService(
      missing as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    await expect(serviceB.issue(secretaria, "m1")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const conflict = {
      ...prismaWithEligibility(true),
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({ id: "c-old", status: "ACTIVE" }),
        create: jest.fn(),
      },
    };
    const serviceC = new CredentialsService(
      conflict as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    await expect(serviceC.issue(secretaria, "m1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("reissues: revokes active then creates new", async () => {
    const tx = {
      churchMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: "m1",
          personId: "p-mem",
          person: { id: "p-mem", displayName: "Bruno Demo" },
        }),
      },
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue({ id: "adm1", status: "APPROVED" }),
      },
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: "c-old",
          status: "ACTIVE",
          opaqueToken,
        }),
        update: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "c-new",
          ...data,
          issuedAt: new Date(),
          revokedAt: null,
        })),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    const card = await service.reissue(secretaria, "m1");
    expect(card.id).toBe("c-new");
    expect(tx.memberCredential.update).toHaveBeenCalled();
  });

  it("reissue fails without eligibility or membership", async () => {
    const tx = {
      churchMembership: { findFirst: jest.fn().mockResolvedValue(null) },
      admissionProtocol: { findFirst: jest.fn() },
      memberCredential: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    await expect(service.reissue(secretaria, "m1")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    tx.churchMembership.findFirst.mockResolvedValue({
      id: "m1",
      personId: "p-mem",
      person: { displayName: "Bruno" },
    });
    tx.admissionProtocol.findFirst.mockResolvedValue(null);
    await expect(service.reissue(secretaria, "m1")).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it("revoke active and already-revoked", async () => {
    const prisma = {
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: "c1",
          status: "ACTIVE",
          opaqueToken,
          issuedAt: new Date(),
          revokedAt: null,
          personId: "p-mem",
          membershipId: "m1",
          person: { displayName: "Bruno Demo" },
        }),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: "c1",
          status: data.status,
          opaqueToken,
          issuedAt: new Date(),
          revokedAt: data.revokedAt,
          personId: "p-mem",
          membershipId: "m1",
          person: { displayName: "Bruno Demo" },
        })),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    const revoked = await service.revoke(secretaria, "c1");
    expect(revoked.status).toBe("REVOKED");

    prisma.memberCredential.findFirst.mockResolvedValue({
      id: "c1",
      status: "REVOKED",
      opaqueToken,
      issuedAt: new Date(),
      revokedAt: new Date(),
      personId: "p-mem",
      membershipId: "m1",
      person: { displayName: "Bruno Demo" },
    });
    const again = await service.revoke(secretaria, "c1");
    expect(again.status).toBe("REVOKED");

    prisma.memberCredential.findFirst.mockResolvedValue(null);
    await expect(service.revoke(secretaria, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("getOwn returns card or null", async () => {
    const prisma = {
      memberCredential: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          id: "c1",
          status: "ACTIVE",
          opaqueToken,
          issuedAt: new Date(),
          revokedAt: null,
          personId: "p-mem",
          membershipId: "m1",
          person: { displayName: "Bruno Demo" },
        }),
      },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    await expect(service.getOwn(member)).resolves.toMatchObject({ card: null });
    const withCard = await service.getOwn(member);
    expect(withCard.card?.personId).toBe("p-mem");
  });

  it("lookupByOpaqueToken", async () => {
    const prisma = {
      memberCredential: {
        findUnique: jest.fn().mockResolvedValueOnce({
          status: "ACTIVE",
          issuedAt: new Date("2026-11-04T12:00:00Z"),
          revokedAt: null,
          person: { displayName: "Bruno Demo" },
          church: { name: pilot.churchName, slug: pilot.churchSlug },
        }),
      },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    const hit = await service.lookupByOpaqueToken(opaqueToken);
    expect(hit.displayName).toBe("Bruno Demo");

    prisma.memberCredential.findUnique.mockResolvedValue(null);
    await expect(
      service.lookupByOpaqueToken(opaqueToken),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("member cannot issue cards", async () => {
    const service = new CredentialsService(
      prismaWithEligibility(true) as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    await expect(service.issue(member, "m1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("generatePdf stores real PDF meta without CPF", async () => {
    const prisma = {
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: "c1",
          status: "ACTIVE",
          opaqueToken,
          issuedAt: new Date("2026-11-04T12:00:00Z"),
          revokedAt: null,
          personId: "p-mem",
          membershipId: "m1",
          pdfStorageKey: null,
          person: { displayName: "Bruno Demo" },
        }),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: "c1",
          status: "ACTIVE",
          opaqueToken,
          issuedAt: new Date("2026-11-04T12:00:00Z"),
          revokedAt: null,
          personId: "p-mem",
          membershipId: "m1",
          ...data,
          person: { displayName: "Bruno Demo" },
        })),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    const card = await service.generatePdf(secretaria, "c1");
    expect(storage.put).toHaveBeenCalled();
    expect(card.pdf?.hasFile).toBe(true);
    expect(card.pdf?.contentType).toBe("application/pdf");
    expect(containsSensitiveCredentialPayload(card.qrPayload)).toBe(false);
  });

  it("generatePdf replaces existing pdfStorageKey", async () => {
    storage.remove.mockClear();
    const prisma = {
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: "c1",
          status: "ACTIVE",
          opaqueToken,
          issuedAt: new Date("2026-11-04T12:00:00Z"),
          revokedAt: null,
          personId: "p-mem",
          membershipId: "m1",
          pdfStorageKey: "credentials/old.pdf",
          person: { displayName: "Bruno Demo" },
        }),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: "c1",
          status: "ACTIVE",
          opaqueToken,
          issuedAt: new Date("2026-11-04T12:00:00Z"),
          revokedAt: null,
          personId: "p-mem",
          membershipId: "m1",
          ...data,
          person: { displayName: "Bruno Demo" },
        })),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    await service.generatePdf(secretaria, "c1");
    expect(storage.remove).toHaveBeenCalledWith("credentials/old.pdf");
  });

  it("getPdfMeta and downloadPdf cover missing/present file paths", async () => {
    const base = {
      id: "c1",
      status: "ACTIVE",
      opaqueToken,
      issuedAt: new Date("2026-11-04T12:00:00Z"),
      revokedAt: null,
      personId: "p-mem",
      membershipId: "m1",
      person: { displayName: "Bruno Demo" },
    };
    const prisma = {
      memberCredential: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            ...base,
            pdfStorageKey: null,
            pdfContentType: null,
            pdfByteSize: null,
            pdfGeneratedAt: null,
          })
          .mockResolvedValueOnce({
            ...base,
            pdfStorageKey: null,
            pdfContentType: null,
            pdfByteSize: null,
            pdfGeneratedAt: null,
          })
          .mockResolvedValueOnce({
            ...base,
            pdfStorageKey: "credentials/c1.pdf",
            pdfContentType: "application/pdf",
            pdfByteSize: 1200,
            pdfGeneratedAt: new Date("2026-11-06T12:00:00Z"),
          }),
      },
      auditLog: { create: jest.fn() },
    };
    storage.get.mockResolvedValue(Buffer.from("%PDF-ok"));
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );

    const meta = await service.getPdfMeta(secretaria, "c1");
    expect(meta.hasFile).toBe(false);

    await expect(service.downloadPdf(secretaria, "c1")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const file = await service.downloadPdf(secretaria, "c1");
    expect(file.contentType).toBe("application/pdf");
    expect(file.bytes.toString()).toContain("%PDF");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("forbids unrelated member from accessing PDF", async () => {
    const stranger: AuthUser = {
      userId: "u-other",
      personId: "p-other",
      email: "other@example.test",
      grants: [
        {
          roleCode: "MEMBRO",
          organizationId: "org1",
          churchId: "church-rf1",
        },
      ],
    };
    const prisma = {
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: "c1",
          status: "ACTIVE",
          opaqueToken,
          issuedAt: new Date(),
          revokedAt: null,
          personId: "p-mem",
          membershipId: "m1",
          pdfStorageKey: null,
          person: { displayName: "Bruno Demo" },
        }),
      },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    await expect(service.getPdfMeta(stranger, "c1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows card owner to read pdf-meta", async () => {
    const prisma = {
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: "c1",
          status: "ACTIVE",
          opaqueToken,
          issuedAt: new Date("2026-11-04T12:00:00Z"),
          revokedAt: null,
          personId: "p-mem",
          membershipId: "m1",
          pdfStorageKey: "credentials/c1.pdf",
          pdfContentType: "application/pdf",
          pdfByteSize: 900,
          pdfGeneratedAt: new Date("2026-11-06T12:00:00Z"),
          person: { displayName: "Bruno Demo" },
        }),
      },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      storage as never,
    );
    const meta = await service.getPdfMeta(member, "c1");
    expect(meta).toMatchObject({
      credentialId: "c1",
      hasFile: true,
      contentType: "application/pdf",
      byteSize: 900,
    });
  });
});
