import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  assertOpaqueCredentialPayload,
  canManageMemberships,
  canViewOwnCredential,
  generateOpaqueCredentialToken,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  /** Emite carteirinha para membresia ACTIVE + admissão APPROVED (credentialEligible). */
  async issue(actor: AuthUser, membershipId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanManage(actor, pilot.organizationId, pilot.churchId);

    const membership = await this.prisma.churchMembership.findFirst({
      where: {
        id: membershipId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
        status: "ACTIVE",
      },
      include: {
        person: { select: { id: true, displayName: true } },
      },
    });
    if (!membership) {
      throw new NotFoundException("Membresia ativa não encontrada no piloto");
    }

    await this.assertCredentialEligible(membership.id, pilot);

    const existingActive = await this.prisma.memberCredential.findFirst({
      where: {
        membershipId: membership.id,
        status: "ACTIVE",
      },
    });
    if (existingActive) {
      throw new ConflictException(
        "Já existe carteirinha ativa; revogue ou use reissue",
      );
    }

    return this.createCard(actor, membership, pilot);
  }

  /**
   * Revoga carteirinha ativa (se houver) e emite nova — secretaria.
   * Mantém gate credentialEligible.
   */
  async reissue(actor: AuthUser, membershipId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanManage(actor, pilot.organizationId, pilot.churchId);

    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.churchMembership.findFirst({
        where: {
          id: membershipId,
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
          status: "ACTIVE",
        },
        include: {
          person: { select: { id: true, displayName: true } },
        },
      });
      if (!membership) {
        throw new NotFoundException("Membresia ativa não encontrada no piloto");
      }

      const approved = await tx.admissionProtocol.findFirst({
        where: {
          membershipId: membership.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          status: "APPROVED",
        },
      });
      if (!approved) {
        throw new BusinessException(
          "Carteirinha bloqueada: admissão pastoral não aprovada (credentialEligible=false)",
          "CREDENTIAL_NOT_ELIGIBLE",
        );
      }

      const active = await tx.memberCredential.findFirst({
        where: { membershipId: membership.id, status: "ACTIVE" },
      });
      if (active) {
        await tx.memberCredential.update({
          where: { id: active.id },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: "credential.revoke",
            resourceType: "member_credential",
            resourceId: active.id,
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            metadata: { reason: "reissue" },
          },
        });
      }

      const opaqueToken = generateOpaqueCredentialToken();
      assertOpaqueCredentialPayload(opaqueToken);
      const credential = await tx.memberCredential.create({
        data: {
          membershipId: membership.id,
          personId: membership.personId,
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
          status: "ACTIVE",
          opaqueToken,
          issuedByUserId: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "credential.reissue",
          resourceType: "member_credential",
          resourceId: credential.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { membershipId: membership.id },
        },
      });

      return this.toPublicCard(
        credential,
        membership.person.displayName,
        pilot.churchName,
      );
    });
  }

  /** Revoga carteirinha (secretaria). */
  async revoke(actor: AuthUser, credentialId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanManage(actor, pilot.organizationId, pilot.churchId);

    const credential = await this.prisma.memberCredential.findFirst({
      where: {
        id: credentialId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
      },
      include: {
        person: { select: { displayName: true } },
      },
    });
    if (!credential) {
      throw new NotFoundException("Carteirinha não encontrada no piloto");
    }
    if (credential.status === "REVOKED") {
      return this.toPublicCard(
        credential,
        credential.person.displayName,
        pilot.churchName,
      );
    }

    const updated = await this.prisma.memberCredential.update({
      where: { id: credential.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
      },
      include: {
        person: { select: { displayName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "credential.revoke",
        resourceType: "member_credential",
        resourceId: updated.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });

    return this.toPublicCard(
      updated,
      updated.person.displayName,
      pilot.churchName,
    );
  }

  /** Membro autenticado: própria carteirinha ativa (se houver). */
  async getOwn(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();

    const credential = await this.prisma.memberCredential.findFirst({
      where: {
        personId: actor.personId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
        status: "ACTIVE",
      },
      include: {
        person: { select: { displayName: true } },
      },
      orderBy: { issuedAt: "desc" },
    });

    if (!credential) {
      return { card: null, church: { name: pilot.churchName, slug: pilot.churchSlug } };
    }

    if (!canViewOwnCredential(actor.personId, credential.personId)) {
      throw new ForbiddenException("Carteirinha de outra pessoa");
    }

    return {
      card: this.toPublicCard(
        credential,
        credential.person.displayName,
        pilot.churchName,
      ),
      church: { name: pilot.churchName, slug: pilot.churchSlug },
    };
  }

  /**
   * Lookup público mínimo por token opaco (validação de QR).
   * Não devolve CPF/telefone — só status + nome de exibição.
   */
  async lookupByOpaqueToken(opaqueToken: string) {
    assertOpaqueCredentialPayload(opaqueToken);
    const credential = await this.prisma.memberCredential.findUnique({
      where: { opaqueToken },
      include: {
        person: { select: { displayName: true } },
        church: { select: { name: true, slug: true } },
      },
    });
    if (!credential) {
      throw new NotFoundException("Carteirinha não encontrada");
    }
    return {
      status: credential.status,
      displayName: credential.person.displayName,
      churchName: credential.church.name,
      issuedAt: credential.issuedAt.toISOString(),
      revokedAt: credential.revokedAt?.toISOString() ?? null,
      // Nunca ecoar o token em lookups públicos além da confirmação de existência
    };
  }

  private async assertCredentialEligible(
    membershipId: string,
    pilot: { organizationId: string; churchId: string },
  ): Promise<void> {
    const approved = await this.prisma.admissionProtocol.findFirst({
      where: {
        membershipId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        status: "APPROVED",
      },
    });
    if (!approved) {
      throw new BusinessException(
        "Carteirinha bloqueada: admissão pastoral não aprovada (credentialEligible=false)",
        "CREDENTIAL_NOT_ELIGIBLE",
      );
    }
  }

  private async createCard(
    actor: AuthUser,
    membership: {
      id: string;
      personId: string;
      person: { displayName: string };
    },
    pilot: {
      organizationId: string;
      churchId: string;
      churchName: string;
    },
  ) {
    const opaqueToken = generateOpaqueCredentialToken();
    assertOpaqueCredentialPayload(opaqueToken);

    const credential = await this.prisma.memberCredential.create({
      data: {
        membershipId: membership.id,
        personId: membership.personId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
        status: "ACTIVE",
        opaqueToken,
        issuedByUserId: actor.userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "credential.issue",
        resourceType: "member_credential",
        resourceId: credential.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: {
          membershipId: membership.id,
          personId: membership.personId,
        },
      },
    });

    return this.toPublicCard(
      credential,
      membership.person.displayName,
      pilot.churchName,
    );
  }

  private assertCanManage(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    if (
      !canManageMemberships(actor.grants, {
        organizationId,
        churchId,
      })
    ) {
      throw new ForbiddenException(
        "Sem permissão de secretaria nesta congregação",
      );
    }
  }

  private toPublicCard(
    credential: {
      id: string;
      status: string;
      opaqueToken: string;
      issuedAt: Date;
      revokedAt: Date | null;
      personId: string;
      membershipId: string;
    },
    displayName: string,
    churchName: string,
  ) {
    assertOpaqueCredentialPayload(credential.opaqueToken);
    return {
      id: credential.id,
      status: credential.status,
      displayName,
      churchName,
      /** Único conteúdo do QR — token opaco, sem PII. */
      qrPayload: credential.opaqueToken,
      issuedAt: credential.issuedAt.toISOString(),
      revokedAt: credential.revokedAt?.toISOString() ?? null,
      personId: credential.personId,
      membershipId: credential.membershipId,
    };
  }
}
