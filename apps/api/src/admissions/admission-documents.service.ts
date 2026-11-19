import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ADMISSION_MODALITIES,
  canManageAdmissions,
  canApprovePastoralAdmission,
  type AdmissionModality,
} from "@idbrf/shared";
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
    const admission = await this.requireAdmission(admissionId, pilot);
    const [rows, requirements] = await Promise.all([
      this.prisma.admissionDocument.findMany({
        where: { admissionId },
        orderBy: { createdAt: "desc" },
      }),
      admission.modality
        ? this.prisma.admissionDocumentRequirement.findMany({
          where: { organizationId: pilot.organizationId, churchId: pilot.churchId, modality: admission.modality, active: true },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        })
        : Promise.resolve([]),
    ]);
    const linked = new Set(rows.map((row) => row.requirementId).filter((id): id is string => Boolean(id)));

    return {
      admissionId,
      documents: rows.map((row) => this.toMeta(row)),
      requirements: requirements.map((row) => ({
        id: row.id,
        modality: row.modality,
        code: row.code,
        label: row.label,
        required: row.required,
        active: row.active,
        sortOrder: row.sortOrder,
        updatedAt: row.updatedAt.toISOString(),
        satisfied: linked.has(row.id),
      })),
    };
  }

  async upload(
    actor: AuthUser,
    admissionId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
    requirementId?: string,
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
    const admission = await this.requireAdmission(admissionId, pilot);
    const linkedRequirementId = await this.requirementForUpload(pilot, admission.modality, requirementId);

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
        requirementId: linkedRequirementId,
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
          ...(linkedRequirementId ? { requirementId: linkedRequirementId } : {}),
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

  /** Remove metadados + bytes privados (SECRETARIA). Sem soft-delete neste contrato. */
  async remove(actor: AuthUser, admissionId: string, documentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canManageAdmissions(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Somente secretaria pode remover documentos");
    }
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

    await this.prisma.admissionDocument.delete({ where: { id: row.id } });
    await this.storage.remove(row.storageKey);

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "admission_document.delete",
        resourceType: "admission_document",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: {
          admissionId,
          contentType: row.contentType,
          byteSize: row.byteSize,
        },
      },
    });

    return { deleted: true as const, id: row.id, admissionId };
  }

  async listRequirements(actor: AuthUser, modality?: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanRead(actor, pilot.organizationId, pilot.churchId);
    const parsed = this.parseModality(modality, false);
    const rows = await this.prisma.admissionDocumentRequirement.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(parsed ? { modality: parsed } : {}),
      },
      orderBy: [{ modality: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    });
    return { requirements: rows.map((row) => this.toRequirement(row)) };
  }

  async createRequirement(actor: AuthUser, input: {
    modality: string;
    code: string;
    label: string;
    required?: boolean;
    sortOrder?: number;
  }) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanConfigure(actor, pilot.organizationId, pilot.churchId);
    const modality = this.parseModality(input.modality, true);
    const code = this.parseCode(input.code);
    const label = input.label?.trim() ?? "";
    if (!label || label.length > 120) throw new BadRequestException("Informe o nome do documento, com até 120 caracteres.");
    const existing = await this.prisma.admissionDocumentRequirement.findFirst({
      where: { churchId: pilot.churchId, modality, code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: "ADMISSION_REQUIREMENT_EXISTS",
        message: "Este tipo documental já está configurado para a modalidade.",
      });
    }
    const row = await this.prisma.admissionDocumentRequirement.create({
      data: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        modality,
        code,
        label,
        required: input.required === true,
        sortOrder: this.parseSort(input.sortOrder),
      },
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ConflictException({
          code: "ADMISSION_REQUIREMENT_EXISTS",
          message: "Este tipo documental já está configurado para a modalidade.",
        });
      }
      throw error;
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "admission_requirement.create",
        resourceType: "admission_document_requirement",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { modality, code, required: row.required },
      },
    });
    return this.toRequirement(row);
  }

  async patchRequirement(actor: AuthUser, requirementId: string, input: {
    label?: string;
    required?: boolean;
    active?: boolean;
    sortOrder?: number;
  }) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanConfigure(actor, pilot.organizationId, pilot.churchId);
    if (input.label === undefined && input.required === undefined && input.active === undefined && input.sortOrder === undefined) {
      throw new BadRequestException("Informe o que deve ser alterado no requisito.");
    }
    const current = await this.prisma.admissionDocumentRequirement.findFirst({
      where: { id: requirementId, organizationId: pilot.organizationId, churchId: pilot.churchId },
    });
    if (!current) throw new NotFoundException("Requisito documental não encontrado");
    const label = input.label === undefined ? current.label : input.label.trim();
    if (!label || label.length > 120) throw new BadRequestException("Informe o nome do documento, com até 120 caracteres.");
    const row = await this.prisma.admissionDocumentRequirement.update({
      where: { id: current.id },
      data: {
        label,
        required: input.required === undefined ? current.required : input.required,
        active: input.active === undefined ? current.active : input.active,
        sortOrder: input.sortOrder === undefined ? current.sortOrder : this.parseSort(input.sortOrder),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "admission_requirement.update",
        resourceType: "admission_document_requirement",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { required: row.required, active: row.active },
      },
    });
    return this.toRequirement(row);
  }

  private async requirementForUpload(
    pilot: { organizationId: string; churchId: string },
    modality: string | null,
    requirementId?: string,
  ) {
    const id = requirementId?.trim();
    if (!id) return null;
    if (!modality) throw new BadRequestException("Registre a modalidade antes de vincular o anexo a um requisito.");
    const requirement = await this.prisma.admissionDocumentRequirement.findFirst({
      where: { id, organizationId: pilot.organizationId, churchId: pilot.churchId, active: true },
    });
    if (!requirement || requirement.modality !== modality) {
      throw new BadRequestException("O anexo precisa usar um requisito ativo desta modalidade.");
    }
    return requirement.id;
  }

  private assertCanConfigure(actor: AuthUser, organizationId: string, churchId: string) {
    if (!canManageAdmissions(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException("Somente a secretaria configura os documentos da admissão");
    }
  }

  private parseModality(value: string | undefined, required: true): AdmissionModality;
  private parseModality(value: string | undefined, required: false): AdmissionModality | undefined;
  private parseModality(value: string | undefined, required: boolean) {
    if (!value) {
      if (required) throw new BadRequestException("Informe a modalidade.");
      return undefined;
    }
    if (!Object.values(ADMISSION_MODALITIES).includes(value as AdmissionModality)) {
      throw new BadRequestException("Modalidade documental desconhecida.");
    }
    return value as AdmissionModality;
  }

  private parseCode(value: string) {
    const code = value?.trim() ?? "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) || code.length > 40) {
      throw new BadRequestException("O código do documento usa letras minúsculas, números e hífen.");
    }
    return code;
  }

  private parseSort(value: number | undefined) {
    if (value === undefined) return 0;
    if (!Number.isInteger(value) || value < 0 || value > 999) {
      throw new BadRequestException("A ordem do requisito precisa ficar entre 0 e 999.");
    }
    return value;
  }

  private toRequirement(row: {
    id: string;
    modality: AdmissionModality;
    code: string;
    label: string;
    required: boolean;
    active: boolean;
    sortOrder: number;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      modality: row.modality,
      code: row.code,
      label: row.label,
      required: row.required,
      active: row.active,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
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
    requirementId?: string | null;
  }) {
    return {
      id: row.id,
      admissionId: row.admissionId,
      displayName: row.displayName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      createdAt: row.createdAt.toISOString(),
      requirementId: row.requirementId ?? null,
    };
  }
}

function sanitizeDisplayName(name: string): string {
  const base = name.replace(/[/\\]/g, "").trim() || "documento";
  return base.slice(0, 120);
}
