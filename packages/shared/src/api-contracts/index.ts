export {
  API_CONTRACT_VERSION,
  API_PATH_PREFIX,
  joinApiPath,
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
  AdmissionListResponse,
  HealthResponse,
} from "./dto";

export {
  MOCK_ADMISSION_AWAITING_DOCUMENTS,
  MOCK_ADMISSION_APPROVED,
  MOCK_ADMISSION_STEP_LOCKED,
  MOCK_ADMISSION_ROLE_REQUIRED,
  MOCK_CREDENTIAL_NOT_ELIGIBLE,
} from "./mocks";

/**
 * Matriz de implementação vs contrato (FE usa para feature flags).
 * `implemented` = a API Nest desta entrega responde de fato.
 * `proposed` = contrato acordado; backend ainda não entrega (FE mocka).
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
  "POST /admissions": "implemented",
  "GET /admissions/:admissionId": "implemented",
  "POST /admissions/:admissionId/advance": "implemented",
  "GET /admissions": "implemented",
} as const;

export type ApiEndpointKey = keyof typeof API_ENDPOINT_STATUS;
