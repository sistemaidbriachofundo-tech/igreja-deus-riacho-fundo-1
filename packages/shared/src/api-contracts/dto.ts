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
  /** Contexto ativo F6 — default RF1 quando grant cobre. Presente desde 0.6.0-f6. */
  organizationId?: string | null;
  churchId?: string | null;
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

/** Mensagem de chat do Riachinho (alias interno Vivi; FE → API `/vivi/*`). */
export interface ViviChatMessageDto {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ViviChatRequest {
  messages: ViviChatMessageDto[];
  /** Obrigatório em POST /public/vivi/chat (LGPD). */
  consentAiProcessing?: boolean;
  sessionId?: string | null;
}

export interface ViviChatUsageDto {
  inputChars: number;
  outputChars: number;
  messageCount: number;
  latencyMs: number;
}

/** Referência opcional a fato oficial usado na resposta (aditivo 0.7.1-vivi). */
export interface ViviKnowledgeSourceDto {
  kind: "ministry" | "event" | "cms";
  slug: string;
  title: string;
}

export interface ViviChatResponse {
  reply: string;
  provider: "manus" | "gemini" | "mock";
  model: string;
  refused: boolean;
  lgpdNotice: string;
  usage: ViviChatUsageDto;
  /** Versão do system prompt institucional (opcional / backward-compat). */
  promptVersion?: string;
  /** Fontes oficiais consultadas no retrieval estruturado (opcional). */
  sources?: ViviKnowledgeSourceDto[];
  /** true quando pedido factual não achou dado publicado (opcional). */
  knowledgeMiss?: boolean;
}

export interface ViviStatusResponse {
  /** Alias interno estável (rotas `/vivi/*`). */
  assistant: "vivi";
  /** Nome de produto exibido ao usuário. */
  displayName: "Riachinho";
  provider: "manus" | "gemini" | "mock";
  model: string;
  manusUrlConfigured: boolean;
  manusKeyConfigured: boolean;
  geminiKeyConfigured: boolean;
  lgpdNotice: string;
  notes: string[];
  /** Presente após PR B — FE pode ignorar. */
  promptVersion?: string;
  knowledge?: {
    mode: "structured-cms";
    ragEnabled: false;
    refreshPolicy: "live-db-on-each-request";
  };
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
  /** Null quando PLATFORM_ADMIN lista escopo org-wide. */
  churchId: string | null;
  organizationId?: string;
  scope?: "church" | "organization";
  logs: AuditLogEntryDto[];
}

export interface ChurchSummaryDto {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  isPilotDefault: boolean;
}

export interface ChurchesListResponse {
  organizationId: string;
  defaultChurchId: string;
  churches: ChurchSummaryDto[];
}

export interface SwitchChurchRequest {
  churchId: string;
}

export interface IndicatorsSummaryDto {
  stub: true;
  organizationId: string;
  churchId: string | null;
  scope: "church" | "organization";
  generatedAt: string;
  counts: {
    membershipsActive: number;
    membershipsPending: number;
    admissionsOpen: number;
    transfersOpen: number;
    pastoralOpen: number;
  };
}

export interface IndicatorsMembershipDto {
  stub: true;
  organizationId: string;
  churchId: string;
  generatedAt: string;
  byStatus: Record<string, number>;
}
