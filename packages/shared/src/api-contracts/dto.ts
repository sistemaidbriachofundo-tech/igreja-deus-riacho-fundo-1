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
}

export interface PersonSummaryDto {
  id: string;
  displayName: string;
  email: string | null;
  status: string;
  householdId: string | null;
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
  createdAt: string;
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
