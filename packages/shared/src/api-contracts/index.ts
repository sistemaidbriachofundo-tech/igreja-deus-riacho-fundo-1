export {
  API_CONTRACT_VERSION,
  API_PATH_PREFIX,
  type ApiContractVersion,
} from "./version";

export {
  ADMISSION_STATUSES,
  ADMISSION_MODALITIES,
  ADMISSION_STEP_ORDER,
  MEMBERSHIP_STATUSES,
  CREDENTIAL_STATUSES,
  type AdmissionStatus,
  type AdmissionModality,
  type AdmissionStep,
  type MembershipStatusContract,
  type CredentialStatusContract,
} from "./enums";

export type {
  ApiErrorBody,
  AuthUserDto,
  LoginRequest,
  LoginResponse,
  PersonSummaryDto,
  MembershipDto,
  MembershipListResponse,
  RegisterMembershipRequest,
  MemberCardDto,
  CredentialMeResponse,
  CredentialVerifyResponse,
  HouseholdDto,
  CreateHouseholdRequest,
  PersonSearchRequest,
  PersonSearchHit,
  PersonSearchResponse,
  AdmissionChecklistDto,
  AdmissionDto,
  CreateAdmissionRequest,
  AdvanceAdmissionRequest,
  HealthResponse,
  PatchPersonRequest,
  PersonDossierResponse,
  AdmissionDocumentMetaDto,
  AdmissionDocumentsListResponse,
} from "./dto";

/**
 * Matriz de implementação vs contrato (FE usa para feature flags).
 * `implemented` = disponível na API Nest atual em `main`.
 * `proposed` = contrato 0.2 acordado; backend ainda não entrega.
 */
export const API_ENDPOINT_STATUS = {
  "GET /health": "implemented",
  "POST /auth/login": "implemented",
  "GET /auth/me": "implemented",
  "GET /memberships": "implemented",
  "POST /memberships": "implemented",
  "GET /credentials/me": "implemented",
  "POST /credentials/issue/:membershipId": "implemented",
  "POST /credentials/revoke/:credentialId": "implemented",
  "GET /credentials/verify/:opaqueToken": "implemented",
  "GET /persons/search": "implemented",
  "GET /persons/:personId": "implemented",
  "GET /persons/:personId/dossier": "implemented",
  "PATCH /persons/:personId": "implemented",
  "POST /households": "implemented",
  "GET /households/:householdId": "implemented",
  "POST /households/:householdId/members": "implemented",
  "DELETE /households/:householdId/members/:personId": "implemented",
  "POST /admissions": "implemented",
  "GET /admissions/:admissionId": "implemented",
  "POST /admissions/:admissionId/advance": "implemented",
  "GET /admissions": "implemented",
  "GET /admissions/:admissionId/documents": "implemented",
  "POST /admissions/:admissionId/documents": "implemented",
  "GET /admissions/:admissionId/documents/:documentId": "implemented",
  "POST /credentials/reissue/:membershipId": "implemented",
} as const;

export type ApiEndpointKey = keyof typeof API_ENDPOINT_STATUS;
