import type { AdmissionDto, ApiErrorBody } from "./dto";

/**
 * Exemplos fictícios para o frontend mockar o contrato 0.3.0-f2.
 * Nenhum dado pessoal real.
 */
export const MOCK_ADMISSION_AWAITING_DOCUMENTS: AdmissionDto = {
  id: "adm_demo_001",
  personId: "per_visit_demo",
  membershipId: "mem_pending_001",
  status: "AWAITING_DOCUMENTS",
  modality: "BATISMO",
  currentStep: "documents",
  checklist: {
    modalityRecorded: true,
    documentsComplete: false,
    secretariaApproved: false,
    pastorApproved: false,
  },
  notes: null,
  createdAt: "2026-11-04T15:00:00.000Z",
  updatedAt: "2026-11-04T15:00:00.000Z",
  credentialEligible: false,
};

export const MOCK_ADMISSION_APPROVED: AdmissionDto = {
  id: "adm_demo_001",
  personId: "per_visit_demo",
  membershipId: "mem_pending_001",
  status: "APPROVED",
  modality: "BATISMO",
  currentStep: "pastor",
  checklist: {
    modalityRecorded: true,
    documentsComplete: true,
    secretariaApproved: true,
    pastorApproved: true,
  },
  notes: null,
  createdAt: "2026-11-04T15:00:00.000Z",
  updatedAt: "2026-11-04T16:00:00.000Z",
  credentialEligible: true,
};

export const MOCK_ADMISSION_STEP_LOCKED: ApiErrorBody = {
  statusCode: 409,
  message: "Etapa pastor bloqueada até concluir secretaria",
  error: "Conflict",
  code: "ADMISSION_STEP_LOCKED",
};

export const MOCK_ADMISSION_ROLE_REQUIRED: ApiErrorBody = {
  statusCode: 403,
  message: "Aprovação pastoral requer papel PASTOR",
  error: "Forbidden",
  code: "ADMISSION_ROLE_REQUIRED",
};

export const MOCK_CREDENTIAL_NOT_ELIGIBLE: ApiErrorBody = {
  statusCode: 409,
  message:
    "Carteirinha exige admissão aprovada pelo pastor e membresia ACTIVE",
  error: "Conflict",
  code: "CREDENTIAL_NOT_ELIGIBLE",
};
