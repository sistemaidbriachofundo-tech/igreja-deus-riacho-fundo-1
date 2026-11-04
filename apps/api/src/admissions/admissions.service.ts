import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ADMISSION_STATUSES,
  assertAdmissionStepAllowed,
  canApprovePastoralAdmission,
  canManageAdmissions,
  isCredentialEligible,
  type AdmissionModality,
  type AdmissionStep,
  type CreateAdmissionRequest,
  type AdvanceAdmissionRequest,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async list(actor: AuthUser, status?: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanList(actor, pilot.organizationId, pilot.churchId);

    const rows = await this.prisma.admissionProtocol.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return { admissions: rows.map((row) => this.toDto(row)) };
  }

  async getById(actor: AuthUser, admissionId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanList(actor, pilot.organizationId, pilot.churchId);
    const row = await this.findInPilot(admissionId, pilot);
    return this.toDto(row);
  }

  async create(actor: AuthUser, input: CreateAdmissionRequest) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canManageAdmissions(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão de secretaria nesta congregação");
    }

    return this.prisma.$transaction(async (tx) => {
      let personId = input.personId?.trim();

      if (personId) {
        const existing = await tx.person.findFirst({
          where: {
            id: personId,
            organizationId: pilot.organizationId,
          },
        });
        if (!existing) {
          throw new NotFoundException("Pessoa não encontrada neste escopo");
        }
        if (existing.isMinor && !existing.legalGuardianPersonId) {
          throw new BadRequestException(
            "Menor de idade exige responsável legal (legalGuardianPersonId)",
          );
        }
      } else {
        const displayName = input.displayName?.trim();
        if (!displayName) {
          throw new BadRequestException(
            "Informe personId ou displayName para abrir admissão",
          );
        }
        if (input.householdId) {
          const hh = await tx.household.findFirst({
            where: {
              id: input.householdId,
              organizationId: pilot.organizationId,
              churchId: pilot.churchId,
            },
          });
          if (!hh) {
            throw new NotFoundException("Família não encontrada no piloto");
          }
        }
        const person = await tx.person.create({
          data: {
            organizationId: pilot.organizationId,
            homeChurchId: pilot.churchId,
            householdId: input.householdId ?? null,
            displayName,
            email: input.email?.trim().toLowerCase() || null,
            kind: "VISITOR",
            status: "ACTIVE",
          },
        });
        personId = person.id;
      }

      const duplicateOpen = await tx.admissionProtocol.findFirst({
        where: {
          personId,
          churchId: pilot.churchId,
          status: {
            in: [
              "DRAFT",
              "AWAITING_DOCUMENTS",
              "AWAITING_SECRETARIA",
              "AWAITING_PASTOR",
            ],
          },
        },
      });
      if (duplicateOpen) {
        throw new BusinessException(
          "Já existe protocolo de admissão em andamento para esta pessoa",
          "ADMISSION_ALREADY_OPEN",
        );
      }

      let membership = await tx.churchMembership.findUnique({
        where: {
          personId_churchId: {
            personId: personId!,
            churchId: pilot.churchId,
          },
        },
      });

      if (!membership) {
        membership = await tx.churchMembership.create({
          data: {
            personId: personId!,
            churchId: pilot.churchId,
            organizationId: pilot.organizationId,
            status: "PENDING_ADMISSION",
            notes: input.notes?.trim() || null,
          },
        });
      } else if (membership.status === "ACTIVE") {
        throw new BusinessException(
          "Pessoa já possui membresia ACTIVE nesta congregação",
          "MEMBERSHIP_ALREADY_ACTIVE",
        );
      }

      const modality = (input.modality as AdmissionModality | undefined) ?? null;
      const modalityRecorded = Boolean(modality);

      const admission = await tx.admissionProtocol.create({
        data: {
          personId: personId!,
          membershipId: membership.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          status: modalityRecorded
            ? "AWAITING_DOCUMENTS"
            : "DRAFT",
          modality,
          currentStep: modalityRecorded ? "documents" : "modality",
          modalityRecorded,
          notes: input.notes?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "admission.create",
          resourceType: "admission_protocol",
          resourceId: admission.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { personId, membershipId: membership.id },
        },
      });

      return this.toDto(admission);
    });
  }

  async advance(
    actor: AuthUser,
    admissionId: string,
    input: AdvanceAdmissionRequest,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const completeStep = input.completeStep as AdmissionStep;

    return this.prisma.$transaction(async (tx) => {
      const admission = await tx.admissionProtocol.findFirst({
        where: {
          id: admissionId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });
      if (!admission) {
        throw new NotFoundException("Protocolo não encontrado");
      }
      if (
        admission.status === "APPROVED" ||
        admission.status === "REJECTED" ||
        admission.status === "CANCELLED"
      ) {
        throw new BusinessException(
          "Protocolo encerrado — não pode avançar",
          "ADMISSION_CLOSED",
        );
      }

      const checklist = {
        modalityRecorded: admission.modalityRecorded,
        documentsComplete: admission.documentsComplete,
        secretariaApproved: admission.secretariaApproved,
        pastorApproved: admission.pastorApproved,
      };

      const gate = assertAdmissionStepAllowed(completeStep, checklist);
      if (!gate.ok) {
        throw new BusinessException(gate.message, gate.code);
      }

      if (completeStep === "secretaria" || completeStep === "pastor") {
        if (!input.decision) {
          throw new BadRequestException(
            "decision APPROVE|REJECT é obrigatório nesta etapa",
          );
        }
      }

      if (completeStep === "secretaria") {
        if (
          !canManageAdmissions(actor.grants, {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
          })
        ) {
          throw new BusinessException(
            "Aprovação de secretaria requer papel SECRETARIA",
            "ADMISSION_ROLE_REQUIRED",
            403,
          );
        }
      }

      if (completeStep === "pastor") {
        if (
          !canApprovePastoralAdmission(actor.grants, {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
          })
        ) {
          throw new BusinessException(
            "Aprovação pastoral requer papel PASTOR",
            "ADMISSION_ROLE_REQUIRED",
            403,
          );
        }
      }

      if (input.decision === "REJECT") {
        const rejected = await tx.admissionProtocol.update({
          where: { id: admission.id },
          data: {
            status: "REJECTED",
            rejectionReason: input.rejectionReason?.trim() || null,
            notes: input.notes?.trim() || admission.notes,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: "admission.reject",
            resourceType: "admission_protocol",
            resourceId: admission.id,
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            metadata: { step: completeStep, reason: input.rejectionReason },
          },
        });
        return this.toDto(rejected);
      }

      const data: Record<string, unknown> = {
        notes: input.notes?.trim() || admission.notes,
      };

      if (completeStep === "modality") {
        const modality = (input.modality as AdmissionModality | undefined) ?? admission.modality;
        if (!modality) {
          throw new BadRequestException("modality é obrigatória nesta etapa");
        }
        data.modality = modality;
        data.modalityRecorded = true;
        data.currentStep = "documents";
        data.status = "AWAITING_DOCUMENTS";
      } else if (completeStep === "documents") {
        data.documentsComplete = true;
        data.currentStep = "secretaria";
        data.status = "AWAITING_SECRETARIA";
      } else if (completeStep === "secretaria") {
        data.secretariaApproved = true;
        data.currentStep = "pastor";
        data.status = "AWAITING_PASTOR";
      } else if (completeStep === "pastor") {
        data.pastorApproved = true;
        data.currentStep = "pastor";
        data.status = "APPROVED";
      }

      const updated = await tx.admissionProtocol.update({
        where: { id: admission.id },
        data: data as never,
      });

      if (updated.status === "APPROVED" && updated.membershipId) {
        await tx.churchMembership.update({
          where: { id: updated.membershipId },
          data: { status: "ACTIVE" },
        });
        await tx.person.update({
          where: { id: updated.personId },
          data: { kind: "MEMBER" },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "admission.advance",
          resourceType: "admission_protocol",
          resourceId: admission.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            completeStep,
            decision: input.decision ?? "APPROVE",
            status: updated.status,
          },
        },
      });

      return this.toDto(updated);
    });
  }

  private assertCanList(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    const ok =
      canManageAdmissions(actor.grants, { organizationId, churchId }) ||
      canApprovePastoralAdmission(actor.grants, { organizationId, churchId });
    if (!ok) {
      throw new ForbiddenException("Sem permissão para listar admissões");
    }
  }

  private async findInPilot(
    admissionId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const row = await this.prisma.admissionProtocol.findFirst({
      where: {
        id: admissionId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Protocolo não encontrado");
    }
    return row;
  }

  private toDto(row: {
    id: string;
    personId: string;
    membershipId: string | null;
    status: string;
    modality: string | null;
    currentStep: string;
    modalityRecorded: boolean;
    documentsComplete: boolean;
    secretariaApproved: boolean;
    pastorApproved: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const status = row.status as keyof typeof ADMISSION_STATUSES | string;
    return {
      id: row.id,
      personId: row.personId,
      membershipId: row.membershipId,
      status: row.status,
      modality: row.modality,
      currentStep: row.currentStep,
      checklist: {
        modalityRecorded: row.modalityRecorded,
        documentsComplete: row.documentsComplete,
        secretariaApproved: row.secretariaApproved,
        pastorApproved: row.pastorApproved,
      },
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      credentialEligible: isCredentialEligible(status as never),
    };
  }
}
