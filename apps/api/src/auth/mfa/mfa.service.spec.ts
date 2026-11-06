import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { MfaService } from "./mfa.service";
import { currentTotpCode } from "./totp.util";
import { encryptTotpSecret } from "./mfa-crypto.util";
import type { AuthUser } from "../types/auth-user";

describe("MfaService", () => {
  const actor: AuthUser = {
    userId: "u1",
    personId: "p1",
    email: "ana.demo@example.test",
    grants: [{ roleCode: "SECRETARIA", organizationId: "org1", churchId: "c1" }],
  };

  it("enrolls, confirms, and disables TOTP", async () => {
    let stored: {
      id: string;
      status: string;
      secretCiphertext: string | null;
    } | null = null;

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          mfaRequired: false,
          mfaFactors: [],
        }),
      },
      userMfaFactor: {
        findUnique: jest.fn().mockImplementation(async () => stored),
        create: jest.fn().mockImplementation(async ({ data }) => {
          stored = { id: "f1", status: data.status, secretCiphertext: data.secretCiphertext };
          return { ...stored, label: data.label };
        }),
        update: jest.fn().mockImplementation(async ({ data }) => {
          stored = {
            id: "f1",
            status: data.status ?? stored?.status ?? "DISABLED",
            secretCiphertext:
              data.secretCiphertext === undefined
                ? stored?.secretCiphertext ?? null
                : data.secretCiphertext,
          };
          return {
            ...stored,
            verifiedAt: data.verifiedAt ?? null,
            disabledAt: data.disabledAt ?? null,
          };
        }),
      },
      auditLog: { create: jest.fn() },
    };

    const service = new MfaService(prisma as never);
    const enrolled = await service.enrollTotp(actor);
    expect(enrolled.status).toBe("PENDING_ENROLLMENT");
    expect(enrolled.otpauthUri).toContain("otpauth://totp/");

    const code = currentTotpCode(enrolled.secret);
    const confirmed = await service.confirmTotp(actor, code);
    expect(confirmed.status).toBe("ENABLED");

    stored = {
      id: "f1",
      status: "ENABLED",
      secretCiphertext: encryptTotpSecret(enrolled.secret),
    };
    const disabled = await service.disableTotp(actor, code);
    expect(disabled.status).toBe("DISABLED");
  });

  it("getStatus returns totp null, factor, or NotFound", async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ mfaRequired: false, mfaFactors: [] })
          .mockResolvedValueOnce({
            mfaRequired: true,
            mfaFactors: [
              {
                id: "f1",
                factorType: "TOTP",
                status: "ENABLED",
                label: "App",
                verifiedAt: new Date("2026-11-06T12:00:00Z"),
                disabledAt: null,
              },
            ],
          }),
      },
    };
    const service = new MfaService(prisma as never);
    await expect(service.getStatus(actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getStatus(actor)).resolves.toMatchObject({
      totp: null,
      oidcLive: false,
      mfaRequired: false,
    });
    const withFactor = await service.getStatus(actor);
    expect(withFactor.totp).toMatchObject({
      factorId: "f1",
      status: "ENABLED",
      verifiedAt: "2026-11-06T12:00:00.000Z",
      disabledAt: null,
    });
  });

  it("reenrolls via update when PENDING exists", async () => {
    const prisma = {
      userMfaFactor: {
        findUnique: jest.fn().mockResolvedValue({
          id: "f-old",
          status: "PENDING_ENROLLMENT",
          secretCiphertext: "old",
        }),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: "f-old",
          status: data.status,
          secretCiphertext: data.secretCiphertext,
          label: data.label,
        })),
        create: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new MfaService(prisma as never);
    const enrolled = await service.enrollTotp(actor, "  Phone  ");
    expect(prisma.userMfaFactor.update).toHaveBeenCalled();
    expect(prisma.userMfaFactor.create).not.toHaveBeenCalled();
    expect(enrolled.factorId).toBe("f-old");
  });

  it("rejects confirm without pending enrollment", async () => {
    const prisma = {
      userMfaFactor: { findUnique: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn() },
    };
    const service = new MfaService(prisma as never);
    await expect(service.confirmTotp(actor, "123456")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects confirm with invalid TOTP code", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const prisma = {
      userMfaFactor: {
        findUnique: jest.fn().mockResolvedValue({
          id: "f1",
          status: "PENDING_ENROLLMENT",
          secretCiphertext: encryptTotpSecret(secret),
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new MfaService(prisma as never);
    await expect(service.confirmTotp(actor, "000000")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("disableTotp handles already disabled, missing code, and bad code", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const cipher = encryptTotpSecret(secret);
    const prisma = {
      userMfaFactor: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: "f1",
            status: "DISABLED",
            secretCiphertext: null,
          })
          .mockResolvedValueOnce({
            id: "f1",
            status: "ENABLED",
            secretCiphertext: cipher,
          })
          .mockResolvedValueOnce({
            id: "f1",
            status: "ENABLED",
            secretCiphertext: cipher,
          }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new MfaService(prisma as never);
    await expect(service.disableTotp(actor)).resolves.toMatchObject({
      status: "DISABLED",
      factorId: null,
    });
    await expect(service.disableTotp(actor)).resolves.toMatchObject({
      status: "DISABLED",
      factorId: "f1",
    });
    await expect(service.disableTotp(actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.disableTotp(actor, "000000")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("getLoginMfaHint computes challengeRequired", async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            mfaRequired: true,
            mfaFactors: [{ id: "f1" }],
          })
          .mockResolvedValueOnce({
            mfaRequired: true,
            mfaFactors: [],
          })
          .mockResolvedValueOnce({
            mfaRequired: false,
            mfaFactors: [{ id: "f1" }],
          }),
      },
    };
    const service = new MfaService(prisma as never);
    await expect(service.getLoginMfaHint("u1")).resolves.toEqual({
      mfaEnabled: false,
      mfaRequired: false,
      challengeRequired: false,
    });
    await expect(service.getLoginMfaHint("u1")).resolves.toEqual({
      mfaEnabled: true,
      mfaRequired: true,
      challengeRequired: true,
    });
    await expect(service.getLoginMfaHint("u1")).resolves.toMatchObject({
      challengeRequired: false,
      mfaRequired: true,
      mfaEnabled: false,
    });
    await expect(service.getLoginMfaHint("u1")).resolves.toMatchObject({
      challengeRequired: false,
      mfaEnabled: true,
    });
  });

  it("rejects double enroll when ENABLED", async () => {
    const prisma = {
      userMfaFactor: {
        findUnique: jest.fn().mockResolvedValue({
          id: "f1",
          status: "ENABLED",
          secretCiphertext: "x",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new MfaService(prisma as never);
    await expect(service.enrollTotp(actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
