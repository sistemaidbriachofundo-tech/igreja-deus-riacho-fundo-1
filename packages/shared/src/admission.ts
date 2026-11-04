import type { AdmissionChecklistDto } from "./api-contracts/dto";
import {
  ADMISSION_MODALITIES,
  ADMISSION_STATUSES,
  ADMISSION_STEP_ORDER,
  MEMBERSHIP_STATUSES,
  type AdmissionModality,
  type AdmissionStatus,
  type AdmissionStep,
} from "./api-contracts/enums";
import type { ChurchId, OrganizationId, RoleCode } from "./ids";
import { ROLE_CODES, hasAccess, type AuthGrant } from "./rbac";

export const ADMISSION_TERMINAL_STATUSES = [
  ADMISSION_STATUSES.APPROVED,
  ADMISSION_STATUSES.REJECTED,
  ADMISSION_STATUSES.CANCELLED,
] as const;

/** Pastor lista a fila pastoral e o resultado; rascunhos ficam na secretaria. */
export const PASTOR_LIST_STATUSES = [
  ADMISSION_STATUSES.AWAITING_PASTOR,
  ADMISSION_STATUSES.APPROVED,
  ADMISSION_STATUSES.REJECTED,
] as const;

export interface AdmissionScopeTarget {
  organizationId: OrganizationId;
  churchId: ChurchId;
}

export function isAdmissionModality(value: unknown): value is AdmissionModality {
  return (
    typeof value === "string" &&
    (Object.values(ADMISSION_MODALITIES) as string[]).includes(value)
  );
}

export function isAdmissionStep(value: unknown): value is AdmissionStep {
  return (
    typeof value === "string" &&
    (ADMISSION_STEP_ORDER as readonly string[]).includes(value)
  );
}

export function isAdmissionStatus(value: unknown): value is AdmissionStatus {
  return (
    typeof value === "string" &&
    (Object.values(ADMISSION_STATUSES) as string[]).includes(value)
  );
}

/** Etapa corrente. Depois da secretaria, permanece em `pastor` (inclusive se já aprovado). */
export function admissionCurrentStep(
  checklist: AdmissionChecklistDto,
): AdmissionStep {
  if (!checklist.modalityRecorded) {
    return "modality";
  }
  if (!checklist.documentsComplete) {
    return "documents";
  }
  if (!checklist.secretariaApproved) {
    return "secretaria";
  }
  return "pastor";
}

/**
 * Carteirinha só com protocolo APPROVED, pastor aprovou e membresia ACTIVE.
 */
export function credentialEligible(input: {
  admissionStatus: string;
  membershipStatus: string | null | undefined;
  pastorApproved: boolean;
}): boolean {
  return (
    input.admissionStatus === ADMISSION_STATUSES.APPROVED &&
    input.membershipStatus === MEMBERSHIP_STATUSES.ACTIVE &&
    input.pastorApproved
  );
}

export function rolesForAdmissionStep(step: AdmissionStep): RoleCode[] {
  if (step === "pastor") {
    return [ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN];
  }
  return [ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN];
}

export function canAdvanceAdmissionStep(
  grants: AuthGrant[],
  step: AdmissionStep,
  target: AdmissionScopeTarget,
): boolean {
  return hasAccess(grants, {
    roleCodes: rolesForAdmissionStep(step),
    organizationId: target.organizationId,
    churchId: target.churchId,
  });
}

/** Abrir protocolo e operar etapas de secretaria. */
export function canOpenAdmission(
  grants: AuthGrant[],
  target: AdmissionScopeTarget,
): boolean {
  return hasAccess(grants, {
    roleCodes: [ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN],
    organizationId: target.organizationId,
    churchId: target.churchId,
  });
}

export function canReviewPastoralQueue(
  grants: AuthGrant[],
  target: AdmissionScopeTarget,
): boolean {
  return hasAccess(grants, {
    roleCodes: [ROLE_CODES.PASTOR],
    organizationId: target.organizationId,
    churchId: target.churchId,
  });
}
