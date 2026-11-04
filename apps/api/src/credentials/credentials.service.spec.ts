import {
  ConflictException,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import {
  containsSensitiveCredentialPayload,
  isOpaqueCredentialToken,
} from "@idbrf/shared";
import { CredentialsService } from "./credentials.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("CredentialsService", () => {
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

  it("issues card with opaque QR payload (no CPF/phone)", async () => {
    const prisma = {
      churchMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: "m1",
          personId: "p-mem",
          status: "ACTIVE",
          person: { id: "p-mem", displayName: "Bruno Demo" },
        }),
      },
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: "c1",
          ...data,
          issuedAt: new Date("2026-11-04T12:00:00Z"),
          revokedAt: null,
        })),
      },
      admission: {
        findFirst: jest.fn().mockResolvedValue({
          id: "adm-approved",
          status: "APPROVED",
          pastorDecidedAt: new Date("2026-11-04T11:00:00.000Z"),
          pastorDecidedByUserId: "u-pas",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const card = await service.issue(secretaria, "m1");
    expect(isOpaqueCredentialToken(card.qrPayload)).toBe(true);
    expect(containsSensitiveCredentialPayload(card.qrPayload)).toBe(false);
    expect(card.qrPayload).not.toMatch(/cpf|telefone|@|\d{3}\.\d{3}/i);
    expect(card.displayName).toBe("Bruno Demo");
    expect(prisma.memberCredential.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            admissionId: "adm-approved",
            credentialEligible: true,
          }),
        }),
      }),
    );
  });

  it("refuses a card when pastoral approval is missing", async () => {
    const prisma = {
      churchMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: "m1",
          personId: "p-mem",
          status: "ACTIVE",
          person: { id: "p-mem", displayName: "Bruno Demo" },
        }),
      },
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      admission: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn() },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    try {
      await service.issue(secretaria, "m1");
      throw new Error("deveria falhar");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const body = (error as HttpException).getResponse() as {
        statusCode: number;
        code?: string;
      };
      expect(body.statusCode).toBe(409);
      expect(body.code).toBe("CREDENTIAL_NOT_ELIGIBLE");
    }
    expect(prisma.memberCredential.create).not.toHaveBeenCalled();
  });

  it("refuses second active card without revoke", async () => {
    const prisma = {
      churchMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: "m1",
          personId: "p-mem",
          status: "ACTIVE",
          person: { id: "p-mem", displayName: "Bruno Demo" },
        }),
      },
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({ id: "c-old", status: "ACTIVE" }),
        create: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new CredentialsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(service.issue(secretaria, "m1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.memberCredential.create).not.toHaveBeenCalled();
  });

  it("getOwn returns only actor person card", async () => {
    const prisma = {
      memberCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: "c1",
          status: "ACTIVE",
          opaqueToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
    );

    const result = await service.getOwn(member);
    expect(result.card?.personId).toBe("p-mem");
    expect(prisma.memberCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ personId: "p-mem", status: "ACTIVE" }),
      }),
    );
  });

  it("member cannot issue cards", async () => {
    const service = new CredentialsService(
      {
        churchMembership: { findFirst: jest.fn() },
        memberCredential: { findFirst: jest.fn(), create: jest.fn() },
        auditLog: { create: jest.fn() },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(service.issue(member, "m1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
