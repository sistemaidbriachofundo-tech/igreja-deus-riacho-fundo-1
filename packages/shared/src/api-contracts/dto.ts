import type { AuthGrant } from "../rbac";
import type {
  AdmissionModality,
  AdmissionStatus,
  AdmissionStep,
  CredentialStatusContract,
  MembershipStatusContract,
} from "./enums";

/** Envelope de erro estável para o FE. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** Código de negócio opcional (ex.: ADMISSION_STEP_LOCKED). */
  code?: string;
}

export interface AuthUserDto {
  userId: string;
  personId: string;
  email: string;
  grants: AuthGrant[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: AuthUserDto;
  /** Hint MFA/OIDC — challenge hard ainda não bloqueia JWT neste contrato. */
  mfa?: {
    enabled: boolean;
    required: boolean;
    challengeRequired: boolean;
    oidcLive: false;
  };
}

export interface PersonSummaryDto {
  id: string;
  displayName: string;
  email: string | null;
  status: string;
  householdId: string | null;
  kind?: string;
  isMinor?: boolean;
}

export interface MembershipDto {
  id: string;
  status: MembershipStatusContract | string;
  joinedAt: string;
  notes: string | null;
  person: PersonSummaryDto;
  activeCredentialId: string | null;
  /** Presente quando o protocolo de admissão existir (contrato 0.2). */
  admissionId?: string | null;
}

export interface MembershipListResponse {
  church: { id: string; slug: string; name: string };
  memberships: MembershipDto[];
}

/** Cadastro rápido legado (v0.1) — preferir fluxo /admissions no 0.2. */
export interface RegisterMembershipRequest {
  displayName: string;
  email?: string;
  notes?: string;
  householdLabel?: string;
  personId?: string;
}

export interface MemberCardDto {
  id: string;
  status: CredentialStatusContract | string;
  displayName: string;
  churchName: string;
  /** Único conteúdo do QR — token opaco, sem PII. */
  qrPayload: string;
  issuedAt: string;
  revokedAt: string | null;
  personId: string;
  membershipId: string;
  /** Metadados do PDF privado (se já gerado). */
  pdf?: CredentialPdfMetaDto | null;
}

/** Metadados do PDF da carteirinha — sem URL pública e sem bytes. */
export interface CredentialPdfMetaDto {
  contentType: string;
  byteSize: number;
  generatedAt: string;
  hasFile: boolean;
}

export interface MfaStatusResponse {
  mfaRequired: boolean;
  totp: {
    factorId: string;
    status: string;
    label: string | null;
    verifiedAt: string | null;
    disabledAt: string | null;
  } | null;
  oidcLive: false;
}

export interface OidcConfigResponse {
  organizationId: string;
  liveIdp: false;
  config: {
    id: string;
    status: string;
    displayName: string | null;
    issuerUrl: string | null;
    clientId: string | null;
    clientSecretRef: string | null;
    redirectUri: string | null;
    scopes: string;
    updatedAt: string;
    clientSecret: null;
  } | null;
}

export interface CredentialMeResponse {
  card: MemberCardDto | null;
  church: { name: string; slug: string };
}

export interface CredentialVerifyResponse {
  status: CredentialStatusContract | string;
  displayName: string;
  churchName: string;
  issuedAt: string;
  revokedAt: string | null;
}

export interface HouseholdDto {
  id: string;
  label: string | null;
  churchId: string;
  organizationId: string;
  memberPersonIds: string[];
  members?: Array<{ id: string; displayName: string; isMinor: boolean }>;
  createdAt: string;
}

export interface HouseholdListResponse {
  churchId: string;
  households: HouseholdDto[];
}

export interface CreateHouseholdRequest {
  label?: string;
  /** person_ids fictícios já existentes no piloto. */
  memberPersonIds?: string[];
}

export interface PersonSearchRequest {
  /** Texto livre (nome/e-mail). Nunca faz merge automático. */
  q: string;
  limit?: number;
}

export interface PersonSearchHit {
  person: PersonSummaryDto;
  /** Score relativo 0–1 para UI de dedupe assistida. */
  score: number;
  matchReasons: Array<"displayName" | "email">;
}

export interface PersonSearchResponse {
  query: string;
  hits: PersonSearchHit[];
  /** Sempre true no contrato: FE não deve oferecer merge automático. */
  autoMergeForbidden: true;
}

export interface AdmissionChecklistDto {
  modalityRecorded: boolean;
  documentsComplete: boolean;
  secretariaApproved: boolean;
  pastorApproved: boolean;
}

export interface AdmissionDto {
  id: string;
  personId: string;
  membershipId: string | null;
  status: AdmissionStatus;
  modality: AdmissionModality | null;
  currentStep: AdmissionStep;
  checklist: AdmissionChecklistDto;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Carteirinha só quando true. */
  credentialEligible: boolean;
}

export interface CreateAdmissionRequest {
  /** Pessoa existente OU criação assistida no mesmo request. */
  personId?: string;
  displayName?: string;
  email?: string;
  householdId?: string;
  modality?: AdmissionModality;
  notes?: string;
}

export interface AdvanceAdmissionRequest {
  /** Etapa que o ator está concluindo. Servidor valida ordem e papel. */
  completeStep: AdmissionStep;
  modality?: AdmissionModality;
  notes?: string;
  /** Secretaria / pastor: decisão na etapa correspondente. */
  decision?: "APPROVE" | "REJECT";
  rejectionReason?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
}

export interface PatchPersonRequest {
  isMinor?: boolean;
  legalGuardianPersonId?: string | null;
  householdId?: string | null;
}

export interface PersonDossierResponse {
  person: PersonSummaryDto & {
    kind: string;
    isMinor: boolean;
    legalGuardianPersonId: string | null;
  };
  legalGuardian: { id: string; displayName: string; email: string | null } | null;
  dependents: Array<{ id: string; displayName: string; isMinor: boolean }>;
  household: {
    id: string;
    label: string | null;
    members: Array<{ id: string; displayName: string; isMinor: boolean }>;
  } | null;
  memberships: Array<{
    id: string;
    status: string;
    joinedAt: string;
    notes: string | null;
  }>;
  admissionHistory: Array<{
    id: string;
    status: string;
    modality: string | null;
    currentStep: string;
    checklist: AdmissionChecklistDto;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface AdmissionDocumentMetaDto {
  id: string;
  admissionId: string;
  displayName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface AdmissionDocumentsListResponse {
  admissionId: string;
  documents: AdmissionDocumentMetaDto[];
}

export interface MetaResponse {
  app: string;
  slug: string;
  contractVersion: string;
  apiPathPrefix: string;
  pilot: boolean;
  endpoints: Record<string, "implemented" | "proposed">;
  hmlPublicUrl: string | null;
  notes: string[];
}

export interface AuditLogEntryDto {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AuditLogsResponse {
  churchId: string;
  logs: AuditLogEntryDto[];
}
