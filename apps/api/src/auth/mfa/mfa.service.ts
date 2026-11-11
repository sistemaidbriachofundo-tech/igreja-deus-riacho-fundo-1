import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { APP_NAME } from "@idbrf/shared";
import type { AuthUser } from "../types/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { decryptTotpSecret, encryptTotpSecret } from "./mfa-crypto.util";
import {
  buildOtpAuthUri,
  generateTotpSecret,
  verifyTotpCode,
} from "./totp.util";

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Status MFA do usuário autenticado (sem secret). */
  async getStatus(actor: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        mfaRequired: true,
        mfaFactors: {
          where: { factorType: "TOTP" },
          select: {
            id: true,
            factorType: true,
            status: true,
            label: true,
            verifiedAt: true,
            disabledAt: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException("Usuário não encontrado");
    }
    const totp = user.mfaFactors[0] ?? null;
    return {
      mfaRequired: user.mfaRequired,
      totp: totp
        ? {
            factorId: totp.id,
            status: totp.status,
            label: totp.label,
            verifiedAt: totp.verifiedAt?.toISOString() ?? null,
            disabledAt: totp.disabledAt?.toISOString() ?? null,
          }
        : null,
      /** Login federado OIDC não está live neste contrato. */
      oidcLive: false,
    };
  }

  /**
   * Inicia enrollment TOTP — devolve otpauth URI uma vez.
   * Não exige IdP; TOTP é local.
   */
  async enrollTotp(actor: AuthUser, label?: string) {
    const existing = await this.prisma.userMfaFactor.findUnique({
      where: {
        userId_factorType: { userId: actor.userId, factorType: "TOTP" },
      },
    });
    if (existing?.status === "ENABLED") {
      throw new ConflictException("TOTP já habilitado; desabilite antes");
    }

    const secret = generateTotpSecret();
    const secretCiphertext = encryptTotpSecret(secret);
    const factor = existing
      ? await this.prisma.userMfaFactor.update({
          where: { id: existing.id },
          data: {
            status: "PENDING_ENROLLMENT",
            secretCiphertext,
            label: label?.trim() || "Authenticator",
            verifiedAt: null,
            disabledAt: null,
          },
        })
      : await this.prisma.userMfaFactor.create({
          data: {
            userId: actor.userId,
            factorType: "TOTP",
            status: "PENDING_ENROLLMENT",
            secretCiphertext,
            label: label?.trim() || "Authenticator",
          },
        });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "mfa.totp.enroll_start",
        resourceType: "user_mfa_factor",
        resourceId: factor.id,
      },
    });

    return {
      factorId: factor.id,
      status: factor.status,
      otpauthUri: buildOtpAuthUri({
        secret,
        accountName: actor.email,
        issuer: APP_NAME,
      }),
      /** Secret em claro só no enrollment; FE deve descartar após confirmar. */
      secret,
      message: "Confirme com POST /auth/mfa/totp/confirm usando um código válido",
    };
  }

  async confirmTotp(actor: AuthUser, code: string) {
    const factor = await this.prisma.userMfaFactor.findUnique({
      where: {
        userId_factorType: { userId: actor.userId, factorType: "TOTP" },
      },
    });
    if (!factor || factor.status !== "PENDING_ENROLLMENT" || !factor.secretCiphertext) {
      throw new BadRequestException("Nenhum enrollment TOTP pendente");
    }
    const secret = decryptTotpSecret(factor.secretCiphertext);
    if (!verifyTotpCode(secret, code)) {
      throw new BadRequestException("Código TOTP inválido");
    }

    const updated = await this.prisma.userMfaFactor.update({
      where: { id: factor.id },
      data: {
        status: "ENABLED",
        verifiedAt: new Date(),
        disabledAt: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "mfa.totp.enable",
        resourceType: "user_mfa_factor",
        resourceId: updated.id,
      },
    });

    return {
      factorId: updated.id,
      status: updated.status,
      verifiedAt: updated.verifiedAt!.toISOString(),
    };
  }

  async disableTotp(actor: AuthUser, code?: string) {
    const factor = await this.prisma.userMfaFactor.findUnique({
      where: {
        userId_factorType: { userId: actor.userId, factorType: "TOTP" },
      },
    });
    if (!factor || factor.status === "DISABLED") {
      return { status: "DISABLED" as const, factorId: factor?.id ?? null };
    }

    if (factor.status === "ENABLED" && factor.secretCiphertext) {
      if (!code) {
        throw new BadRequestException("Código TOTP obrigatório para desabilitar");
      }
      const secret = decryptTotpSecret(factor.secretCiphertext);
      if (!verifyTotpCode(secret, code)) {
        throw new BadRequestException("Código TOTP inválido");
      }
    }

    const updated = await this.prisma.userMfaFactor.update({
      where: { id: factor.id },
      data: {
        status: "DISABLED",
        secretCiphertext: null,
        disabledAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "mfa.totp.disable",
        resourceType: "user_mfa_factor",
        resourceId: updated.id,
      },
    });

    return { factorId: updated.id, status: updated.status };
  }

  /**
   * Hint legado. O bloqueio do JWT está em AuthService: perfil privilegiado
   * ou mfaRequired não recebe sessão antes do TOTP.
   */
  async getLoginMfaHint(userId: string): Promise<{
    mfaEnabled: boolean;
    mfaRequired: boolean;
    challengeRequired: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        mfaRequired: true,
        mfaFactors: {
          where: { factorType: "TOTP", status: "ENABLED" },
          select: { id: true },
        },
      },
    });
    const mfaEnabled = Boolean(user?.mfaFactors.length);
    const mfaRequired = Boolean(user?.mfaRequired);
    return {
      mfaEnabled,
      mfaRequired,
      challengeRequired: mfaRequired && mfaEnabled,
    };
  }
}
