import { BadRequestException, ConflictException } from "@nestjs/common";
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
