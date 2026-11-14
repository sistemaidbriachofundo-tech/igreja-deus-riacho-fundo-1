import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  assertOpaqueCredentialPayload,
  canAccessCredentialPdf,
  canManageMemberships,
  canViewOwnCredential,
  containsSensitiveCredentialPayload,
  generateOpaqueCredentialToken,
} from "@idbrf/shared";
import QRCode from "qrcode";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { PrivateStorageService } from "../storage/private-storage.service";
import { jpegPortrait, portraitDataUrl } from "../persons/person-photo";
import { renderCredentialPdf } from "./credential-pdf.renderer";

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly storage: PrivateStorageService,
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

  /**
   * Membro autenticado: a própria carteirinha mais recente.
   * Ativa tem prioridade; se só houver revogada, ela volta para o QR inválido aparecer.
   */
  async getOwn(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();

    const credential = await this.prisma.memberCredential.findFirst({
      where: {
        personId: actor.personId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
      },
      include: {
        person: { select: { displayName: true } },
      },
      orderBy: [{ status: "asc" }, { issuedAt: "desc" }],
    });

    if (!credential) {
      return { card: null, church: { name: pilot.churchName, slug: pilot.churchSlug } };
    }

    if (!canViewOwnCredential(actor.personId, credential.personId)) {
      throw new ForbiddenException("Carteirinha de outra pessoa");
    }

    const card = this.toPublicCard(
      credential,
      credential.person.displayName,
      pilot.churchName,
    );
    return {
      card: await this.withPresentation(card, pilot),
      church: { name: pilot.churchName, slug: pilot.churchSlug },
    };
  }

  /** Secretaria ou titular: abre uma carteirinha pelo id persistido. */
  async getById(actor: AuthUser, credentialId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const credential = await this.loadCredentialForPdf(actor, credentialId, pilot);
    const card = this.toPublicCard(
      credential,
      credential.person.displayName,
      pilot.churchName,
    );
    return this.withPresentation(card, pilot);
  }

  /**
   * Secretaria ou titular: última carteirinha da mesma membresia.
   * 404 quando a matrícula não tem credencial — a UI não inventa cartão.
   */
  async getByMembership(actor: AuthUser, membershipId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const membership = await this.prisma.churchMembership.findFirst({
      where: {
        id: membershipId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
      },
      select: {
        id: true,
        personId: true,
      },
    });
    if (!membership) {
      throw new NotFoundException("Membresia não encontrada no piloto");
    }
    this.assertCanRead(actor, membership.personId, pilot);

    const credential = await this.prisma.memberCredential.findFirst({
      where: {
        membershipId: membership.id,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
      },
      include: {
        person: { select: { displayName: true } },
      },
      orderBy: [{ status: "asc" }, { issuedAt: "desc" }],
    });
    if (!credential) {
      throw new NotFoundException("Carteirinha não encontrada no piloto");
    }
    const card = this.toPublicCard(
      credential,
      credential.person.displayName,
      pilot.churchName,
    );
    return this.withPresentation(card, pilot);
  }

  /**
   * Gera PDF real da carteirinha (pdfkit + QR opaco) e grava em STORAGE_ROOT.
   * Sem CPF no conteúdo — só displayName, igreja, data e token opaco.
   */
  async generatePdf(actor: AuthUser, credentialId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const credential = await this.loadCredentialForPdf(actor, credentialId, pilot);

    const pdfBytes = await renderCredentialPdf({
      displayName: credential.person.displayName,
      churchName: pilot.churchName,
      opaqueToken: credential.opaqueToken,
      verificationBaseUrl: process.env.CREDENTIAL_VERIFICATION_WEB_URL || process.env.ACCESS_INVITE_WEB_ORIGIN,
      issuedAt: credential.issuedAt,
      credentialId: credential.id,
      photo: jpegPortrait((await this.getPhoto(credential.personId))?.jpeg),
    });

    if (credential.pdfStorageKey) {
      await this.storage.remove(credential.pdfStorageKey);
    }

    const pdfStorageKey = this.storage.buildCredentialPdfKey({
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      credentialId: credential.id,
    });
    await this.storage.put(pdfStorageKey, pdfBytes);

    const updated = await this.prisma.memberCredential.update({
      where: { id: credential.id },
      data: {
        pdfStorageKey,
        pdfContentType: "application/pdf",
        pdfByteSize: pdfBytes.byteLength,
        pdfGeneratedAt: new Date(),
      },
      include: {
        person: { select: { displayName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "credential.pdf.generate",
        resourceType: "member_credential",
        resourceId: updated.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: {
          byteSize: pdfBytes.byteLength,
          contentSha256: this.storage.contentSha256(pdfBytes),
        },
      },
    });

    return this.toPublicCard(
      updated,
      updated.person.displayName,
      pilot.churchName,
    );
  }

  /** Metadados do PDF — sem bytes e sem URL pública. */
  async getPdfMeta(actor: AuthUser, credentialId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const credential = await this.loadCredentialForPdf(actor, credentialId, pilot);
    return {
      credentialId: credential.id,
      ...this.toPdfMeta(credential),
    };
  }

  /** Download autenticado do PDF privado. */
  async downloadPdf(actor: AuthUser, credentialId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const credential = await this.loadCredentialForPdf(actor, credentialId, pilot);
    if (!credential.pdfStorageKey || !credential.pdfContentType) {
      throw new NotFoundException(
        "PDF ainda não gerado — use POST /credentials/:id/pdf",
      );
    }
    const bytes = await this.storage.get(credential.pdfStorageKey);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "credential.pdf.download",
        resourceType: "member_credential",
        resourceId: credential.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    return {
      contentType: credential.pdfContentType,
      displayName: `carteirinha-${credential.id}.pdf`,
      bytes,
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
    const displayName = containsSensitiveCredentialPayload(credential.person.displayName)
      ? "Membro"
      : credential.person.displayName;
    return {
      status: credential.status,
      /** Só ACTIVE confirma o QR. Revogação torna o mesmo token inválido. */
      valid: credential.status === "ACTIVE",
      displayName,
      churchName: credential.church.name,
      issuedAt: credential.issuedAt.toISOString(),
      revokedAt: credential.revokedAt?.toISOString() ?? null,
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

  private async loadCredentialForPdf(
    actor: AuthUser,
    credentialId: string,
    pilot: { organizationId: string; churchId: string; churchName: string },
  ) {
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
    if (
      !canAccessCredentialPdf(
        actor.grants,
        actor.personId,
        credential.personId,
        {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      )
    ) {
      throw new ForbiddenException("Sem permissão para PDF desta carteirinha");
    }
    assertOpaqueCredentialPayload(credential.opaqueToken);
    return credential;
  }

  private assertCanRead(
    actor: AuthUser,
    personId: string,
    pilot: { organizationId: string; churchId: string },
  ): void {
    if (
      !canAccessCredentialPdf(actor.grants, actor.personId, personId, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão para esta carteirinha");
    }
  }

  /** Ministério formal ativo, se existir. Ausência não inventa nome. */
  private async optionalMinistryName(
    personId: string,
    pilot: { organizationId: string; churchId: string },
  ): Promise<string | null> {
    const table = this.prisma.ministryMembership as
      | {
          findFirst?: (args: unknown) => Promise<{
            ministry?: { name?: string | null } | null;
          } | null>;
        }
      | undefined;
    if (!table?.findFirst) return null;
    const row = await table.findFirst({
      where: {
        personId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
        status: "ATIVO",
        endedAt: null,
      },
      include: { ministry: { select: { name: true } } },
      orderBy: { startedAt: "desc" },
    });
    const name = row?.ministry?.name?.trim() ?? "";
    if (!name || containsSensitiveCredentialPayload(name)) return null;
    return name;
  }

  /** SVG do QR. O desenho carrega só o token opaco, nunca o nome. */
  private async qrMarkup(opaqueToken: string): Promise<string> {
    assertOpaqueCredentialPayload(opaqueToken);
    const svg = await QRCode.toString(opaqueToken, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      width: 180,
    });
    if (!svg.includes("<svg") || /<script|onload=|javascript:/i.test(svg)) {
      throw new Error("QR da carteirinha inválido");
    }
    return svg;
  }

  private async withPresentation<T extends { qrPayload: string; personId: string }>(
    card: T,
    pilot: { organizationId: string; churchId: string },
  ) {
    const [ministryName, qrSvg, photo] = await Promise.all([
      this.optionalMinistryName(card.personId, pilot),
      this.qrMarkup(card.qrPayload),
      this.getPhoto(card.personId),
    ]);
    return { ...card, ministryName, qrSvg, ...(photo ? { photoUrl: portraitDataUrl(photo.jpeg) } : {}) };
  }

  private getPhoto(personId: string) {
    return this.prisma.personPhoto?.findUnique({ where: { personId }, select: { jpeg: true } });
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

  private toPdfMeta(credential: {
    pdfStorageKey: string | null;
    pdfContentType: string | null;
    pdfByteSize: number | null;
    pdfGeneratedAt: Date | null;
  }) {
    if (
      !credential.pdfStorageKey ||
      !credential.pdfContentType ||
      credential.pdfByteSize == null ||
      !credential.pdfGeneratedAt
    ) {
      return { hasFile: false as const, contentType: null, byteSize: null, generatedAt: null };
    }
    return {
      hasFile: true as const,
      contentType: credential.pdfContentType,
      byteSize: credential.pdfByteSize,
      generatedAt: credential.pdfGeneratedAt.toISOString(),
    };
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
      pdfStorageKey?: string | null;
      pdfContentType?: string | null;
      pdfByteSize?: number | null;
      pdfGeneratedAt?: Date | null;
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
      pdf: this.toPdfMeta({
        pdfStorageKey: credential.pdfStorageKey ?? null,
        pdfContentType: credential.pdfContentType ?? null,
        pdfByteSize: credential.pdfByteSize ?? null,
        pdfGeneratedAt: credential.pdfGeneratedAt ?? null,
      }),
    };
  }
}
