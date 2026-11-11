import { acceptRequestId } from "./token";

const OUTCOMES = new Set(["SUCCESS", "DENIED", "ERROR"]);
const SAFE_ID = /^[A-Za-z0-9._:-]{1,96}$/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const MAX_DEPTH = 4;
const MAX_KEYS = 40;
const MAX_STRING = 180;
const MAX_JSON = 4000;

const CONFUSABLES: Record<string, string> = {
  "\u0430": "a",
  "\u0435": "e",
  "\u043e": "o",
  "\u0440": "p",
  "\u0441": "c",
  "\u0443": "y",
  "\u0445": "x",
  "\u0456": "i",
  "\u0455": "s",
  "\u04bb": "h",
};

const SECRET_KEY =
  /password|passwd|senha|secret|token|authorization|cookie|otp|totp|cpf|cnpj|email|mail|phone|telefone|celular|whatsapp|pix|banco|bank|account|agencia|jwt|bearer|refresh|private|document|documento|address|endereco|birth|nascimento|cookie/;

const KEY_EXCEPTIONS = new Set(["emailfingerprint"]);

export interface AuditWriteInput {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  organizationId?: string | null;
  churchId?: string | null;
  metadata?: Record<string, unknown>;
  outcome?: "SUCCESS" | "DENIED" | "ERROR" | null;
  requestId?: string | null;
}

export class AuditWriteRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditWriteRejected";
  }
}

function normalizeKey(key: string): string {
  const folded = key.normalize("NFKC").toLowerCase();
  let mapped = "";
  for (const char of folded) mapped += CONFUSABLES[char] ?? char;
  return mapped.replace(/[^a-z0-9]/g, "");
}

function isSecretKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (KEY_EXCEPTIONS.has(normalized)) return false;
  return SECRET_KEY.test(normalized);
}

function sanitizeString(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_STRING) return undefined;
  if (EMAIL.test(trimmed) || CPF.test(trimmed) || JWT.test(trimmed)) return undefined;
  return trimmed;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return sanitizeString(value);
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 20)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "object") return sanitizeObject(value as Record<string, unknown>, depth + 1);
  return undefined;
}

function sanitizeObject(source: Record<string, unknown>, depth: number): Record<string, unknown> | undefined {
  const clean: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(source)) {
    if (count >= MAX_KEYS || isSecretKey(key)) continue;
    const safeKey = normalizeKey(key);
    if (!safeKey || isSecretKey(safeKey)) continue;
    const safe = sanitizeValue(value, depth);
    if (safe === undefined) continue;
    clean[key.normalize("NFKC").slice(0, 64)] = safe;
    count += 1;
  }
  return count > 0 ? clean : undefined;
}

function optionalId(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!SAFE_ID.test(trimmed)) return undefined;
  return trimmed;
}

export function sanitizeAuditCreateData(input: unknown): AuditWriteInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AuditWriteRejected("Evento de auditoria inválido");
  }
  const source = input as Record<string, unknown>;
  const action = source.action;
  const resourceType = source.resourceType;
  if (typeof action !== "string" || !SAFE_ID.test(action)) {
    throw new AuditWriteRejected("Ação de auditoria rejeitada");
  }
  if (typeof resourceType !== "string" || !SAFE_ID.test(resourceType)) {
    throw new AuditWriteRejected("Recurso de auditoria rejeitado");
  }

  const metadata =
    source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
      ? sanitizeObject(source.metadata as Record<string, unknown>, 0)
      : undefined;
  const encoded = metadata ? JSON.stringify(metadata) : "";
  const limited = encoded.length > MAX_JSON ? { limited: true } : metadata;

  const outcome =
    typeof source.outcome === "string" && OUTCOMES.has(source.outcome)
      ? (source.outcome as AuditWriteInput["outcome"])
      : null;
  const requestId =
    typeof source.requestId === "string" ? acceptRequestId(source.requestId) ?? null : null;

  const data: AuditWriteInput = {
    actorUserId: optionalId(source.actorUserId) ?? null,
    action,
    resourceType,
    resourceId: optionalId(source.resourceId) ?? null,
    organizationId: optionalId(source.organizationId) ?? null,
    churchId: optionalId(source.churchId) ?? null,
    outcome,
    requestId,
  };
  if (limited) data.metadata = limited;
  return data;
}
