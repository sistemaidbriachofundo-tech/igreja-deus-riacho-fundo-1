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
  ACCESS_POLICY_VERSION,
  ACCESS_POLICY_MODE_ENV,
  ACCESS_RESOURCES,
  ACCESS_ACTIONS,
  ACCESS_MATRIX,
  IMPLICIT_GRANT_FINDINGS,
  resolveAccessPolicyMode,
  currentAccessPolicyMode,
  accessRulesForMode,
  formatAccessMatrix,
  evaluateAccess,
  type AccessResource,
  type AccessAction,
  type AccessScopeKind,
  type AccessPolicyMode,
  type AccessDenialCode,
  type AccessRule,
  type AccessRequest,
  type AccessDecision,
  type ImplicitGrantFinding,
} from "./access-policy";

export {
  normalizeAccessPath,
  classifyAccessRoute,
  type ClassifiedAccess,
} from "./access-routes";

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
  normalizePersonSearchText,
  tokenizePersonName,
  scorePersonDedupeMatch,
  isStrongPersonDedupeMatch,
  type PersonDedupeMatchReason,
  type PersonDedupeCandidateInput,
} from "./person-dedupe";

export {
  canManageMemberships,
  canViewOwnCredential,
  canManageAdmissions,
  canApprovePastoralAdmission,
  canSearchPersons,
  canManageTransfers,
  canManageChannels,
  canAccessPastoralCare,
  canLeadMinistry,
  canManageSpecificMinistry,
  canAdministerMinistries,
  canAccessCredentialPdf,
  canManageOidcConfig,
  canAccessFinance,
  type MembershipScopeTarget,
  type MinistryScopeTarget,
} from "./membership-scope";

export {
  canAccessChurch,
  canReadAudit,
  isPlatformAdminInOrg,
  organizationIdsFromGrants,
  explicitChurchIdsFromGrants,
  hasOrgWideGrant,
  resolveDefaultActiveContext,
  DEFAULT_PRODUCT_CHURCH_SLUG,
  type ActiveChurchContext,
} from "./church-access";

export {
  LEDGER_ACCOUNT_TYPES,
  LEDGER_ENTRY_STATUSES,
  LEDGER_LINE_SIDES,
  BANK_IMPORT_FORMATS,
  BANK_IMPORT_STATUSES,
  BANK_IMPORT_ADAPTERS,
  RECONCILIATION_STATUSES,
  BUDGET_STATUSES,
  ACCOUNTING_PERIOD_STATUSES,
  checkBalancedLines,
  nextDualApprovalStage,
  parseSyntheticCsvLines,
  isValidCompetence,
  type LedgerAccountTypeCode,
  type LedgerEntryStatusCode,
  type LedgerLineSideCode,
  type BankImportFormatCode,
  type BankImportStatusCode,
  type BankImportAdapterCode,
  type ReconciliationStatusCode,
  type BudgetStatusCode,
  type AccountingPeriodStatusCode,
  type LedgerLineInput,
  type BalanceCheckResult,
} from "./finance/ledger-rules";

export {
  parseOfxLines,
  parseOfxAmountToCents,
  parseOfxDate,
  type OfxParsedLine,
  type OfxParseResult,
} from "./finance/ofx-parser";

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
  type CredentialPdfMetaDto,
  type CredentialMeResponse,
  type CredentialVerifyResponse,
  type MfaStatusResponse,
  type OidcConfigResponse,
  type HouseholdDto,
  type HouseholdListResponse,
  type CreateHouseholdRequest,
  type PersonSearchRequest,
  type PersonSearchHit,
  type PersonSearchResponse,
  type PersonMatchReason,
  type PersonPhotoStubDto,
  type PersonCandidatesRequest,
  type PersonCandidatesResponse,
  type LetterPdfMetaDto,
  type ChurchLetterDto,
  type AdmissionChecklistDto,
  type AdmissionDto,
  type CreateAdmissionRequest,
  type AdvanceAdmissionRequest,
  type HealthResponse,
  type PatchPersonRequest,
  PERSON_PROFILE_DATES,
  type PersonProfileDates,
  type PersonProfileFields,
  type PersonSex,
  type PersonTimelineEvent,
  type PersonDossierResponse,
  type AdmissionDocumentMetaDto,
  type AdmissionDocumentsListResponse,
  type MetaResponse,
  type IndicatorsSummaryDto,
  type AuditLogEntryDto,
  type AuditLogsResponse,
  type ViviChatMessageDto,
  type ViviChatRequest,
  type ViviChatUsageDto,
  type ViviKnowledgeSourceDto,
  type ViviChatResponse,
  type ViviStatusResponse,
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

export { readSourceSha } from "./release/source-sha";
export {
  HML_API_ORIGIN,
  PAGES_ORIGIN,
  HML_VERCEL_PROJECT,
  HML_DATABASE,
  HML_PERSONAS,
  pagesReleaseDocument,
  evaluateEklesiaRelease,
  type ReleaseStatus,
  type PersonaId,
  type FrontId,
  type ReleaseCheck,
  type AnonymousProbe,
  type FrontReport,
  type PersonaReport,
  type EklesiaObservation,
  type EklesiaVerdict,
  type PagesReleaseDocument,
} from "./release/eklesia-gate";

export {
  REVITALIZATION_EPIC,
  REVITALIZATION_INTEGRATOR_ISSUE,
  REVITALIZATION_BASELINE_SHA,
  HML_ENVIRONMENT_LABEL,
  PRESERVED_HML_PERSON_BASELINE,
  REVITALIZATION_FRONT_IDS,
  REVITALIZATION_OWNERSHIP,
  ownersOfPath,
  databaseNameFromUrl,
  decideHmlMigrate,
  toCredentialPreview,
  credentialPreviewLeaksSensitive,
  ministryNavItems,
  evaluateRevitalization144,
  type RevitalizationFrontId,
  type RevitalizationFrontOwnership,
  type FrontDelivery,
  type SeedObservation,
  type RevitalizationObservation,
  type RevitalizationVerdict,
  type CredentialPreviewModel,
  type MinistryNavItem,
  type MigrateMode,
  type MigrateDecision,
} from "./release/revitalization-144";

export { SITE_COVER_PHOTO, SITE_IDENTITY_PHOTO, SITE_GALLERY_PHOTOS, usesPreviousGallery } from "./site-photos";

export {
  PRIVILEGED_ROLE_CODES,
  DEFAULT_SECURITY_POLICY,
  requiresPrivilegedMfa,
  mfaBlocksPrivilegedSession,
  assertRuntimePolicy,
  policyScopeKey,
  type MfaEnforcementMode,
  type SecurityPolicySnapshot,
} from "./security-f11/policy";
export {
  hashOpaqueToken,
  generateOpaqueToken,
  acceptRequestId,
} from "./security-f11/token";
export {
  assessSession,
  MemorySessionRepository,
  SessionService,
  type AuthSessionStatus,
  type SessionRecord,
  type SessionFailure,
  type SessionRepository,
  type IssuedSession,
} from "./security-f11/session";
export {
  MemoryMfaChallengeRepository,
  MfaChallengeService,
  type MfaChallengePurpose,
  type MfaChallengeStatus,
  type MfaChallengeRecord,
  type MfaChallengeFailure,
  type MfaChallengeRepository,
} from "./security-f11/mfa-challenge";
export {
  MemoryRateLimitStore,
  type RateLimitDecision,
  type RateLimitStore,
} from "./security-f11/rate-limit";
export {
  AuditWriteRejected,
  sanitizeAuditCreateData,
  type AuditWriteInput,
} from "./security-f11/audit-write";
export type { RosterPreviewDto, RosterPreviewPosition } from "./roster-preview";
