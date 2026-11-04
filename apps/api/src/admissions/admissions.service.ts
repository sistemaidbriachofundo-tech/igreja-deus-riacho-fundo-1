import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ADMISSION_TERMINAL_STATUSES,
  PASTOR_LIST_STATUSES,
  admissionCurrentStep,
  canAdvanceAdmissionStep,
  canOpenAdmission,
  canReviewPastoralQueue,
  isAdmissionStatus,
  type AdmissionDto,
  type AdmissionListResponse,
  type AdmissionStatus,
} from "@idbrf/shared";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/types/auth-user";
import { httpError } from "../common/http-error";
import type { PilotChurch } from "../pilot/pilot.service";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import { checklistFromRow, toAdmissionDto } from "./admission.mapper";
import {
  parseAdvanceAdmission,
  parseCreateAdmission,
  type NormalizedAdvanceAdmission,
} from "./admission.validation";

const OPEN_STATUSES: AdmissionStatus[] = [
  "DRAFT",
  "AWAITING_DOCUMENTS",
  "AWAITING_SECRETARIA",
  "AWAITING_PASTOR",
  "APPROVED",
];

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async list(
    actor: AuthUser,
    status?: string,
  ): Promise<AdmissionListResponse> {
    const pilot = await this.pilot.getPilotChurch();
    const mode = this.accessMode(actor, pilot);

    let statusFilter: AdmissionStatus | undefined;
    if (mode === "pastor" && !status) {
      statusFilter = "AWAITING_PASTOR";
    } else if (status) {
      if (!isAdmissionStatus(status)) {
        throw httpError(
          HttpStatus.BAD_REQUEST,
          "status de admissão inválido",
          "VALIDATION_ERROR",
        );
      }
      if (mode === "pastor" && !pastorMayRead(status)) {
        throw httpError(
          HttpStatus.FORBIDDEN,
          "Pastor não lista protocolos fora da alçada pastoral",
          "ADMISSION_ROLE_REQUIRED",
        );
      }
      statusFilter = status;
    }

    const rows = await this.prisma.admission.findMany({
      where: {
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: { membership: true },
      orderBy: { createdAt: "desc" },
    });

    return { admissions: rows.map((row) => toAdmissionDto(row)) };
  }

  async getById(actor: AuthUser, admissionId: string): Promise<AdmissionDto> {
    const pilot = await this.pilot.getPilotChurch();
    const mode = this.accessMode(actor, pilot);
    const row = await this.prisma.admission.findFirst({
      where: {
        id: admissionId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
      },
      include: { membership: true },
    });
    if (!row) {
      throw httpError(HttpStatus.NOT_FOUND, "Protocolo de admissão não encontrado");
    }
    if (mode === "pastor" && !pastorMayRead(row.status)) {
      throw httpError(
        HttpStatus.FORBIDDEN,
        "Protocolo ainda não está na alçada pastoral",
        "ADMISSION_ROLE_REQUIRED",
      );
    }
    return toAdmissionDto(row);
  }

  async create(actor: AuthUser, body: unknown): Promise<AdmissionDto> {
    const input = parseCreateAdmission(body);
    const pilot = await this.pilot.getPilotChurch();
    const target = scopeOf(pilot);
    if (!canOpenAdmission(actor.grants, target)) {
      throw httpError(
        HttpStatus.FORBIDDEN,
        "Sem permissão de secretaria nesta congregação",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const personId = await this.resolvePerson(tx, pilot, input);
      const open = await tx.admission.findFirst({
        where: {
          personId,
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
          status: { in: OPEN_STATUSES },
        },
      });
      if (open) {
        throw httpError(
          HttpStatus.CONFLICT,
          "Já existe protocolo de admissão em aberto para esta pessoa",
          "ADMISSION_ALREADY_OPEN",
        );
      }

      const existingMembership = await tx.churchMembership.findUnique({
        where: {
          personId_churchId: { personId, churchId: pilot.churchId },
        },
      });
      if (
        existingMembership &&
        existingMembership.status !== "PENDING_ADMISSION" &&
        existingMembership.status !== "ACTIVE"
      ) {
        throw httpError(
          HttpStatus.CONFLICT,
          "Pessoa já possui membresia encerrada nesta congregação",
          "MEMBERSHIP_NOT_OPEN",
        );
      }

      const membership =
        existingMembership ??
        (await tx.churchMembership.create({
          data: {
            personId,
            churchId: pilot.churchId,
            organizationId: pilot.organizationId,
            status: "PENDING_ADMISSION",
            notes: input.notes,
          },
        }));

      const now = new Date();
      const created = await tx.admission.create({
        data: {
          personId,
          membershipId: membership.id,
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
          status: input.modality ? "AWAITING_DOCUMENTS" : "DRAFT",
          modality: input.modality ?? null,
          modalityRecordedAt: input.modality ? now : null,
          notes: input.notes,
        },
        include: { membership: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "admission.create",
          resourceType: "admission",
          resourceId: created.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            personId,
            membershipId: membership.id,
            modality: input.modality ?? null,
          },
        },
      });

      return toAdmissionDto(created);
    });
  }

  async advance(
    actor: AuthUser,
    admissionId: string,
    body: unknown,
  ): Promise<AdmissionDto> {
    const input = parseAdvanceAdmission(body);
    const pilot = await this.pilot.getPilotChurch();
    this.accessMode(actor, pilot);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.admission.findFirst({
        where: {
          id: admissionId,
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
        },
        include: { membership: true },
      });
      if (!row) {
        throw httpError(
          HttpStatus.NOT_FOUND,
          "Protocolo de admissão não encontrado",
        );
      }
      if (isTerminal(row.status)) {
        throw httpError(
          HttpStatus.CONFLICT,
          "Protocolo de admissão já encerrado",
          "ADMISSION_STEP_LOCKED",
        );
      }

      const current = admissionCurrentStep(checklistFromRow(row));
      if (input.completeStep !== current) {
        throw httpError(
          HttpStatus.CONFLICT,
          `Etapa ${input.completeStep} bloqueada até concluir ${current}`,
          "ADMISSION_STEP_LOCKED",
        );
      }

      if (!canAdvanceAdmissionStep(actor.grants, input.completeStep, scopeOf(pilot))) {
        throw httpError(
          HttpStatus.FORBIDDEN,
          input.completeStep === "pastor"
            ? "Aprovação pastoral requer papel PASTOR"
            : "Esta etapa requer papel SECRETARIA",
          "ADMISSION_ROLE_REQUIRED",
        );
      }

      const data = this.buildAdvanceData(input, actor, row.membershipId);
      if (data.activateMembership) {
        await tx.churchMembership.update({
          where: { id: row.membershipId! },
          data: { status: "ACTIVE" },
        });
      }

      const updated = await tx.admission.update({
        where: { id: row.id },
        data: data.patch,
        include: { membership: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: data.auditAction,
          resourceType: "admission",
          resourceId: updated.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            completeStep: input.completeStep,
            decision: input.decision ?? null,
            fromStatus: row.status,
            toStatus: updated.status,
            membershipId: updated.membershipId,
          },
        },
      });

      return toAdmissionDto(updated);
    });
  }

  private buildAdvanceData(
    input: NormalizedAdvanceAdmission,
    actor: AuthUser,
    membershipId: string | null,
  ): {
    patch: Prisma.AdmissionUncheckedUpdateInput;
    auditAction: string;
    activateMembership: boolean;
  } {
    const now = new Date();
    const patch: Prisma.AdmissionUncheckedUpdateInput = {};
    if (input.notesProvided) {
      patch.notes = input.notes;
    }

    if (input.completeStep === "modality") {
      if (!input.modality) {
        throw httpError(
          HttpStatus.BAD_REQUEST,
          "modality é obrigatória nesta etapa",
          "VALIDATION_ERROR",
        );
      }
      patch.modality = input.modality;
      patch.modalityRecordedAt = now;
      patch.status = "AWAITING_DOCUMENTS";
      return { patch, auditAction: "admission.advance", activateMembership: false };
    }

    if (input.completeStep === "documents") {
      patch.documentsCompletedAt = now;
      patch.documentsCompletedByUserId = actor.userId;
      patch.status = "AWAITING_SECRETARIA";
      return { patch, auditAction: "admission.advance", activateMembership: false };
    }

    if (!input.decision) {
      throw httpError(
        HttpStatus.BAD_REQUEST,
        "decision é obrigatória nesta etapa",
        "VALIDATION_ERROR",
      );
    }

    if (input.completeStep === "secretaria") {
      if (input.decision === "REJECT") {
        patch.status = "REJECTED";
        patch.rejectionReason = input.rejectionReason;
        return {
          patch,
          auditAction: "admission.secretaria_reject",
          activateMembership: false,
        };
      }
      patch.secretariaDecidedAt = now;
      patch.secretariaDecidedByUserId = actor.userId;
      patch.status = "AWAITING_PASTOR";
      patch.rejectionReason = null;
      return {
        patch,
        auditAction: "admission.secretaria_approve",
        activateMembership: false,
      };
    }

    if (input.decision === "REJECT") {
      patch.status = "REJECTED";
      patch.rejectionReason = input.rejectionReason;
      return {
        patch,
        auditAction: "admission.pastor_reject",
        activateMembership: false,
      };
    }

    if (!membershipId) {
      throw httpError(
        HttpStatus.CONFLICT,
        "Protocolo sem membresia vinculada",
        "ADMISSION_STEP_LOCKED",
      );
    }
    patch.pastorDecidedAt = now;
    patch.pastorDecidedByUserId = actor.userId;
    patch.status = "APPROVED";
    patch.rejectionReason = null;
    return {
      patch,
      auditAction: "admission.pastor_approve",
      activateMembership: true,
    };
  }

  private async resolvePerson(
    tx: Prisma.TransactionClient,
    pilot: PilotChurch,
    input: ReturnType<typeof parseCreateAdmission>,
  ): Promise<string> {
    if (input.personId) {
      const existing = await tx.person.findFirst({
        where: { id: input.personId, organizationId: pilot.organizationId },
      });
      if (!existing) {
        throw httpError(
          HttpStatus.NOT_FOUND,
          "Pessoa não encontrada neste escopo",
        );
      }
      return existing.id;
    }

    let householdId: string | undefined;
    if (input.householdId) {
      const household = await tx.household.findFirst({
        where: {
          id: input.householdId,
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
        },
      });
      if (!household) {
        throw httpError(
          HttpStatus.NOT_FOUND,
          "Família não encontrada neste escopo",
        );
      }
      householdId = household.id;
    }

    const person = await tx.person.create({
      data: {
        organizationId: pilot.organizationId,
        homeChurchId: pilot.churchId,
        householdId,
        displayName: input.displayName ?? "Pessoa Demo",
        email: input.email ?? null,
        status: "ACTIVE",
      },
    });
    return person.id;
  }

  private accessMode(actor: AuthUser, pilot: PilotChurch): "office" | "pastor" {
    const target = scopeOf(pilot);
    if (canOpenAdmission(actor.grants, target)) {
      return "office";
    }
    if (canReviewPastoralQueue(actor.grants, target)) {
      return "pastor";
    }
    throw httpError(
      HttpStatus.FORBIDDEN,
      "Sem permissão para protocolos de admissão nesta congregação",
    );
  }
}

function scopeOf(pilot: PilotChurch) {
  return {
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
  };
}

function pastorMayRead(status: string): boolean {
  return (PASTOR_LIST_STATUSES as readonly string[]).includes(status);
}

function isTerminal(status: string): boolean {
  return (ADMISSION_TERMINAL_STATUSES as readonly string[]).includes(status);
}
