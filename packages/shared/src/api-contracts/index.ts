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
  "GET /persons/search": "proposed",
  "GET /persons/:personId": "proposed",
  "POST /households": "proposed",
  "GET /households/:householdId": "proposed",
  "POST /admissions": "proposed",
  "GET /admissions/:admissionId": "proposed",
  "POST /admissions/:admissionId/advance": "proposed",
  "GET /admissions": "proposed",
} as const;

export type ApiEndpointKey = keyof typeof API_ENDPOINT_STATUS;
