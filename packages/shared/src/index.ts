export type {
  PersonId,
  OrganizationId,
  ChurchId,
  UserId,
  RoleCode,
} from "./ids";

export {
  isPersonId,
  assertPersonId,
  samePersonId,
} from "./person-id";

export {
  ROLE_CODES,
  grantMatchesScope,
  hasAccess,
  type BuiltInRoleCode,
  type GrantScope,
  type AuthGrant,
  type AccessCheck,
} from "./rbac";

export {
  PILOT_ORG_SLUG,
  PILOT_CHURCH_SLUG,
  PILOT_CHURCH_NAME,
} from "./pilot";

export {
  OPAQUE_TOKEN_BYTES,
  generateOpaqueCredentialToken,
  isOpaqueCredentialToken,
  containsSensitiveCredentialPayload,
  assertOpaqueCredentialPayload,
} from "./credential-token";

export {
  canManageMemberships,
  canViewOwnCredential,
  canManageAdmissions,
  canApprovePastoralAdmission,
  canSearchPersons,
  type MembershipScopeTarget,
} from "./membership-scope";

export {
  assertAdmissionStepAllowed,
  nextAdmissionStep,
  isCredentialEligible,
  type AdmissionChecklistState,
} from "./admission-rules";

export {
  API_CONTRACT_VERSION,
  API_PATH_PREFIX,
  ADMISSION_STATUSES,
  ADMISSION_MODALITIES,
  ADMISSION_STEP_ORDER,
  MEMBERSHIP_STATUSES,
  CREDENTIAL_STATUSES,
  API_ENDPOINT_STATUS,
  type ApiContractVersion,
  type AdmissionStatus,
  type AdmissionModality,
  type AdmissionStep,
  type MembershipStatusContract,
  type CredentialStatusContract,
  type ApiEndpointKey,
  type ApiErrorBody,
  type AuthUserDto,
  type LoginRequest,
  type LoginResponse,
  type PersonSummaryDto,
  type MembershipDto,
  type MembershipListResponse,
  type RegisterMembershipRequest,
  type MemberCardDto,
  type CredentialMeResponse,
  type CredentialVerifyResponse,
  type HouseholdDto,
  type CreateHouseholdRequest,
  type PersonSearchRequest,
  type PersonSearchHit,
  type PersonSearchResponse,
  type AdmissionChecklistDto,
  type AdmissionDto,
  type CreateAdmissionRequest,
  type AdvanceAdmissionRequest,
  type HealthResponse,
  type PatchPersonRequest,
  type PersonDossierResponse,
  type AdmissionDocumentMetaDto,
  type AdmissionDocumentsListResponse,
} from "./api-contracts";

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
}

export const APP_NAME = "Igreja de Deus — Riacho Fundo I";
export const APP_SLUG = "igreja-deus-riacho-fundo-1";

export function createHealthStatus(
  service: string,
  status: HealthStatus["status"] = "ok",
): HealthStatus {
  return {
    status,
    service,
    timestamp: new Date().toISOString(),
  };
}
