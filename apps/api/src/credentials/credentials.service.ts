import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
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
import { httpError } from "../common/http-error";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  /** Emite carteirinha para membresia ativa (secretaria). */
  async issue(actor: AuthUser, membershipId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanManage(actor, pilot.organizationId, pilot.churchId);

    const membership = await this.prisma.churchMembership.findFirst({
      where: {
        id: membershipId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
      },
      include: {
        person: { select: { id: true, displayName: true } },
      },
    });
    if (!membership) {
      throw new NotFoundException("Membresia não encontrada no piloto");
    }
    if (membership.status !== "ACTIVE") {
      throw httpError(
        HttpStatus.CONFLICT,
        "Carteirinha exige admissão aprovada pelo pastor e membresia ACTIVE",
        "CREDENTIAL_NOT_ELIGIBLE",
      );
    }

    const existingActive = await this.prisma.memberCredential.findFirst({
      where: {
        membershipId: membership.id,
        status: "ACTIVE",
      },
    });
    if (existingActive) {
      throw new ConflictException(
        "Já existe carteirinha ativa; revogue antes de emitir nova",
      );
    }

    const approvedAdmission = await this.prisma.admission.findFirst({
      where: {
        membershipId: membership.id,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
        status: "APPROVED",
        pastorDecidedAt: { not: null },
        pastorDecidedByUserId: { not: null },
      },
    });
    if (!approvedAdmission) {
      throw httpError(
        HttpStatus.CONFLICT,
        "Carteirinha exige admissão aprovada pelo pastor e membresia ACTIVE",
        "CREDENTIAL_NOT_ELIGIBLE",
      );
    }

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
          admissionId: approvedAdmission.id,
          credentialEligible: true,
        },
      },
    });

    return this.toPublicCard(credential, membership.person.displayName, pilot.churchName);
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
