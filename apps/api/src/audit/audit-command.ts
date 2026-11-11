import { redactAuditMetadata } from "./audit-metadata.redactor";

export const AUDIT_ACTION_PATTERN =
  /^[a-z][a-z0-9_]{0,40}(?:\.[a-z0-9_]{1,40}){0,6}$/;
export const AUDIT_RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,48}$/;
export const AUDIT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
export const AUDIT_METADATA_BYTE_LIMIT = 4096;

export const AUDIT_OUTCOMES = ["success", "denied", "failure"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_DENIAL_ACTIONS = [
  "audit.read.denied",
  "access.denied",
] as const;

export const AUDIT_DENIAL_REASONS = [
  "role",
  "church_scope",
  "org_scope",
  "tenant",
  "policy",
] as const;
export type AuditDenialReason = (typeof AUDIT_DENIAL_REASONS)[number];

const RESERVED_METADATA_KEYS = new Set([
  "actor",
  "actorUserId",
  "email",
  "organizationId",
  "churchId",
  "outcome",
  "correlationId",
  "prevId",
  "prevHash",
  "entryHash",
  "chainVersion",
  "createdAt",
  "timestamp",
  "occurredAt",
  "resourceId",
  "action",
  "resourceType",
]);

export type AuditSensitivity =
  | "operational"
  | "pastoral"
  | "financial"
  | "privilege";

export class AuditCommandError extends Error {
  readonly code: "ACTOR" | "ACTION" | "SCOPE" | "RESOURCE" | "CORRELATION";

  constructor(code: AuditCommandError["code"]) {
    super("Comando de auditoria recusado.");
    this.name = "AuditCommandError";
    this.code = code;
  }
}

export class AuditWriteError extends Error {
  readonly code = "AUDIT_WRITE_FAILED";

  constructor() {
    super("A auditoria da operação sensível não foi gravada.");
    this.name = "AuditWriteError";
  }
}

export class AuditImmutableError extends Error {
  readonly code = "AUDIT_IMMUTABLE";

  constructor() {
    super(
      "audit_logs não aceita update, delete nem expurgo pelo usuário aplicativo.",
    );
    this.name = "AuditImmutableError";
  }
}

export interface AuditActorContext {
  /** Usuário resolvido no servidor. Nunca o ator enviado no corpo. */
  userId: string | null;
  organizationId: string;
  churchId: string | null;
}

export interface AuditEventDraft {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  correlationId?: string | null;
  metadata?: unknown;
  /**
   * Só tem efeito em audit.read.denied e access.denied.
   * Operação sensível ignora o flag e falha fechada.
   */
  bestEffort?: boolean;
}

export interface AuditWriteCommand extends AuditEventDraft {
  actor: AuditActorContext;
}

export interface ValidatedAuditCommand {
  actor: AuditActorContext;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  correlationId: string | null;
  metadata: unknown;
  bestEffort: boolean;
}

export function classifyAuditEvent(
  action: string,
  resourceType?: string | null,
): AuditSensitivity {
  const folded = action.normalize("NFKC").toLowerCase();
  const resource = (resourceType ?? "").normalize("NFKC").toLowerCase();
  if (
    /^(?:ledger|treasury|finance)\./.test(folded) ||
    folded.includes("ledger") ||
    folded.includes("tesouraria") ||
    folded.includes("treasury") ||
    folded.includes("finance") ||
    resource.startsWith("ledger") ||
    resource.startsWith("treasury") ||
    resource.includes("finance")
  ) {
    return "financial";
  }
  if (
    /^pastoral\./.test(folded) ||
    folded.includes("pastoral") ||
    folded.includes("oracao") ||
    folded.includes("aconselh") ||
    resource.startsWith("pastoral")
  ) {
    return "pastoral";
  }
  if (
    /^(?:access|mfa|role|privilege)\./.test(folded) ||
    folded.includes("privilege")
  ) {
    return "privilege";
  }
  return "operational";
}

export function isBestEffortDenial(command: AuditEventDraft): boolean {
  return (
    command.bestEffort === true &&
    (AUDIT_DENIAL_ACTIONS as readonly string[]).includes(command.action)
  );
}

export function normalizeDenialReason(reason: string): AuditDenialReason {
  if ((AUDIT_DENIAL_REASONS as readonly string[]).includes(reason)) {
    return reason as AuditDenialReason;
  }
  return "policy";
}

export function normalizeCorrelationHeader(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!AUDIT_ID_PATTERN.test(trimmed) || trimmed.includes("@")) {
    return undefined;
  }
  return trimmed;
}

export function validateAuditCommand(
  command: AuditWriteCommand,
): ValidatedAuditCommand {
  const userId = command.actor?.userId ?? null;
  if (userId !== null && !AUDIT_ID_PATTERN.test(userId)) {
    throw new AuditCommandError("ACTOR");
  }
  const organizationId = command.actor?.organizationId;
  if (!organizationId || !AUDIT_ID_PATTERN.test(organizationId)) {
    throw new AuditCommandError("SCOPE");
  }
  const churchId = command.actor?.churchId ?? null;
  if (churchId !== null && !AUDIT_ID_PATTERN.test(churchId)) {
    throw new AuditCommandError("SCOPE");
  }
  if (!AUDIT_ACTION_PATTERN.test(command.action)) {
    throw new AuditCommandError("ACTION");
  }
  if (!AUDIT_RESOURCE_TYPE_PATTERN.test(command.resourceType)) {
    throw new AuditCommandError("RESOURCE");
  }
  const resourceId = command.resourceId ?? null;
  if (resourceId !== null && !AUDIT_ID_PATTERN.test(resourceId)) {
    throw new AuditCommandError("RESOURCE");
  }
  if (!(AUDIT_OUTCOMES as readonly string[]).includes(command.outcome)) {
    throw new AuditCommandError("ACTION");
  }
  const correlationId = command.correlationId ?? null;
  if (correlationId !== null && !AUDIT_ID_PATTERN.test(correlationId)) {
    throw new AuditCommandError("CORRELATION");
  }
  return {
    actor: { userId, organizationId, churchId },
    action: command.action,
    resourceType: command.resourceType,
    resourceId,
    outcome: command.outcome,
    correlationId,
    metadata: command.metadata,
    bestEffort: command.bestEffort === true,
  };
}

/**
 * Sanitiza metadata na origem. Chaves reservadas (ator, escopo, outcome,
 * correlação e cadeia) saem do payload do chamador e são recolocadas
 * pelo writer a partir do contexto do servidor.
 */
export function sanitizeWriteMetadata(
  action: string,
  metadata: unknown,
): Record<string, unknown> {
  const redacted = redactAuditMetadata(action, metadata);
  if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(redacted)) {
    if (RESERVED_METADATA_KEYS.has(key)) {
      continue;
    }
    out[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > AUDIT_METADATA_BYTE_LIMIT) {
    return { truncated: true };
  }
  return out;
}
