/** Estados de protocolo de admissão (DAS / protótipo Central de Membresia v5). */
export const ADMISSION_STATUSES = {
  DRAFT: "DRAFT",
  AWAITING_DOCUMENTS: "AWAITING_DOCUMENTS",
  AWAITING_SECRETARIA: "AWAITING_SECRETARIA",
  AWAITING_PASTOR: "AWAITING_PASTOR",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type AdmissionStatus =
  (typeof ADMISSION_STATUSES)[keyof typeof ADMISSION_STATUSES];

/** Modalidades de admissão (checklist — valores iniciais; igreja pode estender). */
export const ADMISSION_MODALITIES = {
  BATISMO: "BATISMO",
  TRANSFERENCIA: "TRANSFERENCIA",
  RECONCILIACAO: "RECONCILIACAO",
  OUTRO: "OUTRO",
} as const;

export type AdmissionModality =
  (typeof ADMISSION_MODALITIES)[keyof typeof ADMISSION_MODALITIES];

/**
 * Ordem obrigatória do checklist (não pular etapas).
 * Carteirinha só após APPROVED + membresia ACTIVE.
 */
export const ADMISSION_STEP_ORDER = [
  "modality",
  "documents",
  "secretaria",
  "pastor",
] as const;

export type AdmissionStep = (typeof ADMISSION_STEP_ORDER)[number];

export const MEMBERSHIP_STATUSES = {
  PENDING_ADMISSION: "PENDING_ADMISSION",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  TRANSFERRED: "TRANSFERRED",
} as const;

export type MembershipStatusContract =
  (typeof MEMBERSHIP_STATUSES)[keyof typeof MEMBERSHIP_STATUSES];

export const CREDENTIAL_STATUSES = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
} as const;

export type CredentialStatusContract =
  (typeof CREDENTIAL_STATUSES)[keyof typeof CREDENTIAL_STATUSES];
