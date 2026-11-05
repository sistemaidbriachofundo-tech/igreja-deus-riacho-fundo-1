import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canManageAdmissions, canApprovePastoralAdmission } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { PrivateStorageService } from "../storage/private-storage.service";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class AdmissionDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly storage: PrivateStorageService,
  ) {}

  async list(actor: AuthUser, admissionId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanRead(actor, pilot.organizationId, pilot.churchId);
    await this.requireAdmission(admissionId, pilot);

    const rows = await this.prisma.admissionDocument.findMany({
      where: { admissionId },
      orderBy: { createdAt: "desc" },
    });

    return {
      admissionId,
      documents: rows.map((row) => this.toMeta(row)),
    };
  }

  async upload(
    actor: AuthUser,
    admissionId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canManageAdmissions(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Somente secretaria pode enviar documentos");
    }
    await this.requireAdmission(admissionId, pilot);

    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        "Tipo não permitido — use PDF, JPEG ou PNG",
      );
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new BadRequestException("Arquivo deve ter entre 1 byte e 5 MiB");
    }

    const displayName = sanitizeDisplayName(file.originalname);
    const storageKey = this.storage.buildAdmissionKey({
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      admissionId,
    });

    await this.storage.put(storageKey, file.buffer);
    const sha256 = this.storage.contentSha256(file.buffer);

    const row = await this.prisma.admissionDocument.create({
      data: {
        admissionId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        uploadedByUserId: actor.userId,
        displayName,
        contentType: file.mimetype,
        byteSize: file.size,
        storageKey,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "admission_document.upload",
        resourceType: "admission_document",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: {
          admissionId,
          contentType: file.mimetype,
          byteSize: file.size,
          sha256,
          // sem nome de arquivo bruto / sem bytes
        },
      },
    });

    return this.toMeta(row);
  }

  async download(actor: AuthUser, admissionId: string, documentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanRead(actor, pilot.organizationId, pilot.churchId);
    await this.requireAdmission(admissionId, pilot);

    const row = await this.prisma.admissionDocument.findFirst({
      where: {
        id: documentId,
        admissionId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Documento não encontrado");
    }

    const bytes = await this.storage.get(row.storageKey);

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "admission_document.download",
        resourceType: "admission_document",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { admissionId },
      },
    });

    return {
      bytes,
      contentType: row.contentType,
      displayName: row.displayName,
    };
  }

  private assertCanRead(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    const ok =
      canManageAdmissions(actor.grants, { organizationId, churchId }) ||
      canApprovePastoralAdmission(actor.grants, { organizationId, churchId });
    if (!ok) {
      throw new ForbiddenException("Sem permissão para documentos de admissão");
    }
  }

  private async requireAdmission(
    admissionId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const admission = await this.prisma.admissionProtocol.findFirst({
      where: {
        id: admissionId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!admission) {
      throw new NotFoundException("Protocolo não encontrado");
    }
    return admission;
  }

  private toMeta(row: {
    id: string;
    admissionId: string;
    displayName: string;
    contentType: string;
    byteSize: number;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      admissionId: row.admissionId,
      displayName: row.displayName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function sanitizeDisplayName(name: string): string {
  const base = name.replace(/[/\\]/g, "").trim() || "documento";
  return base.slice(0, 120);
}
