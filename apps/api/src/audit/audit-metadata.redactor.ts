/**
 * Redige metadata de auditoria na leitura (GET /audit-logs).
 *
 * Allowlist por evento e por campo: identificadores opacos e sinais
 * operacionais curtos passam; o restante volta mascarado. A trilha
 * continua em action, resourceType, resourceId e actorUserId.
 * Não escreve em log, console ou trace.
 */

export const AUDIT_REDACTED = "[redacted]";

const MAX_KEYS = 40;
const MAX_DEPTH = 3;
const MAX_LIST = 100;

const SENSITIVE_EXCEPTIONS = new Set(["emailFingerprint", "hasPhone"]);

const SENSITIVE_TOKENS = new Set([
  "password",
  "passwd",
  "senha",
  "secret",
  "secrets",
  "token",
  "tokens",
  "apikey",
  "authorization",
  "cookie",
  "otp",
  "totp",
  "private",
  "pix",
  "chave",
  "cpf",
  "cnpj",
  "rg",
  "email",
  "mail",
  "phone",
  "telefone",
  "celular",
  "whatsapp",
  "birth",
  "birthdate",
  "nascimento",
  "nasc",
  "guardian",
  "responsavel",
  "minor",
  "menor",
  "child",
  "crianca",
  "school",
  "escola",
  "note",
  "notes",
  "observacao",
  "observacoes",
  "prayer",
  "prayers",
  "oracao",
  "oracoes",
  "testimony",
  "testemunho",
  "counsel",
  "counseling",
  "aconselhamento",
  "confession",
  "confissao",
  "diagnosis",
  "diagnostico",
  "address",
  "endereco",
  "payload",
  "raw",
  "body",
  "message",
  "mensagem",
  "messages",
  "summary",
  "resumo",
  "description",
  "descricao",
  "holder",
  "titular",
  "agencia",
  "account",
  "accounts",
  "banco",
  "bank",
  "documento",
  "document",
  "documents",
  "key",
  "keys",
  "seed",
  "recovery",
  "mnemonic",
  "pin",
  "amount",
  "valor",
  "saldo",
  "balance",
  "money",
  "iban",
]);

type FieldKind =
  | "boolean"
  | "count"
  | "cents"
  | "token"
  | "date"
  | "dateOrToken"
  | "hash"
  | "id"
  | "idList"
  | "fieldNames"
  | "filters"
  | "label";

/** Campos seguros em qualquer evento. Nome, título e valor em centavos não entram. */
const GLOBAL_FIELDS: Record<string, FieldKind> = {
  status: "token",
  previousStatus: "token",
  type: "token",
  kind: "token",
  format: "token",
  adapter: "token",
  role: "token",
  stage: "token",
  decision: "token",
  step: "token",
  completeStep: "token",
  reason: "token",
  code: "token",
  slug: "token",
  channel: "token",
  templateCode: "token",
  provider: "token",
  mode: "token",
  purpose: "token",
  sourceType: "token",
  ministrySlug: "token",
  contentType: "token",
  mimeType: "token",
  from: "dateOrToken",
  to: "dateOrToken",
  periodStart: "date",
  periodEnd: "date",
  cutoffAt: "date",
  serviceAt: "date",
  active: "boolean",
  ok: "boolean",
  done: "boolean",
  liveBankApi: "boolean",
  liveIdp: "boolean",
  idempotent: "boolean",
  system: "boolean",
  mfaEnabled: "boolean",
  mfaRequired: "boolean",
  notifyOnPublish: "boolean",
  issueCertificate: "boolean",
  redactionEnabled: "boolean",
  hasPhone: "boolean",
  version: "count",
  sortOrder: "count",
  weekday: "count",
  year: "count",
  month: "count",
  competenceYear: "count",
  competenceMonth: "count",
  attendanceCount: "count",
  lineCount: "count",
  slotCount: "count",
  activeAssignmentCount: "count",
  count: "count",
  eligibleCount: "count",
  redactedCount: "count",
  byteSize: "count",
  sha256: "hash",
  contentSha256: "hash",
  emailFingerprint: "hash",
  fields: "fieldNames",
  filters: "filters",
  truncated: "boolean",
  outcome: "token",
  correlationId: "id",
  prevId: "id",
  prevHash: "hash",
  entryHash: "hash",
  chainVersion: "count",
};

/**
 * Campos extras, só no evento em que o writer já grava rótulo operacional
 * ou preço público de lote. Fora desta lista, name/title/centavos são máscara.
 */
const EVENT_FIELDS: Record<string, Record<string, FieldKind>> = {
  "small_group.create": { name: "label" },
  "ministry.create": { name: "label" },
  "discipleship.track.create": { name: "label" },
  "portal_event.create": { name: "label" },
  "course.create": { name: "label" },
  "course.class.create": { name: "label" },
  "asset.create": { name: "label" },
  "roster.create": { title: "label" },
  "roster.slot.create": { roleLabel: "label" },
  "event_lot.create": { priceCents: "cents" },
};

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SAFE_KEY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9]{0,40}$/;
const HASH_VALUE = /^[a-f0-9]{16,128}$/i;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const SECRET_MATERIAL =
  /^(?:sk|pk|rk)_[A-Za-z0-9]|bearer\s+\S|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const LABEL_NARRATIVE =
  /pix|senha|oracao|menor|aconselh|testemunh|chave|cpf|token|secret|documento|saldo|iban|confiss/;

export function redactAuditMetadata(
  action: string,
  metadata: unknown,
): unknown {
  if (metadata == null) {
    return null;
  }
  if (!isPlainObject(metadata)) {
    return AUDIT_REDACTED;
  }
  return redactObject(action, metadata, 0, new WeakSet());
}

function redactObject(
  action: string,
  source: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  if (depth > MAX_DEPTH || seen.has(source)) {
    return { truncated: true };
  }
  seen.add(source);
  const out: Record<string, unknown> = {};
  const keys = Object.keys(source).slice(0, MAX_KEYS);
  for (const key of keys) {
    if (BLOCKED_KEYS.has(key) || !SAFE_KEY_NAME.test(key)) {
      continue;
    }
    out[key] = redactField(action, key, source[key], depth, seen);
  }
  if (Object.keys(source).length > MAX_KEYS) {
    out.truncated = true;
  }
  return out;
}

function redactField(
  action: string,
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (BLOCKED_KEYS.has(key) || !SAFE_KEY_NAME.test(key)) {
    return AUDIT_REDACTED;
  }
  if (isSensitiveKey(key) && !SENSITIVE_EXCEPTIONS.has(key)) {
    return AUDIT_REDACTED;
  }
  const kind = fieldKind(action, key);
  if (!kind) {
    return AUDIT_REDACTED;
  }
  return coerce(action, kind, value, depth, seen);
}

function fieldKind(action: string, key: string): FieldKind | undefined {
  if (GLOBAL_FIELDS[key]) {
    return GLOBAL_FIELDS[key];
  }
  const extra = EVENT_FIELDS[action]?.[key];
  if (extra) {
    return extra;
  }
  if (/(?:^id|Id)$/.test(key) && !isSensitiveKey(key)) {
    return "id";
  }
  if (/Ids$/.test(key) && !isSensitiveKey(key)) {
    return "idList";
  }
  return undefined;
}

function isSensitiveKey(key: string): boolean {
  return tokensOf(key).some((token) => SENSITIVE_TOKENS.has(token));
}

function tokensOf(key: string): string[] {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return fold(spaced)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function coerce(
  action: string,
  kind: FieldKind,
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value == null) {
    return null;
  }
  switch (kind) {
    case "boolean":
      return typeof value === "boolean" ? value : AUDIT_REDACTED;
    case "count":
    case "cents":
      return safeCount(value);
    case "token":
      return typeof value === "string" && safeToken(value)
        ? value
        : AUDIT_REDACTED;
    case "date":
      return typeof value === "string" && ISO_DATE.test(value)
        ? value
        : AUDIT_REDACTED;
    case "dateOrToken":
      return typeof value === "string" &&
        (safeToken(value) || ISO_DATE.test(value))
        ? value
        : AUDIT_REDACTED;
    case "hash":
      return typeof value === "string" &&
        HASH_VALUE.test(value) &&
        !/^\d+$/.test(value)
        ? value.toLowerCase()
        : AUDIT_REDACTED;
    case "id":
      return typeof value === "string" && safeId(value)
        ? value
        : AUDIT_REDACTED;
    case "idList":
      return safeIdList(value);
    case "fieldNames":
      return safeFieldNames(value);
    case "label":
      return typeof value === "string" ? safeLabel(value) : AUDIT_REDACTED;
    case "filters":
      return isPlainObject(value)
        ? redactObject(action, value, depth + 1, seen)
        : AUDIT_REDACTED;
    default:
      return AUDIT_REDACTED;
  }
}

function safeCount(value: unknown): number | typeof AUDIT_REDACTED {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return AUDIT_REDACTED;
  }
  if (value < 0 || value > 1_000_000_000) {
    return AUDIT_REDACTED;
  }
  return value;
}

function safeToken(value: string): boolean {
  if (scanText(value) !== value) {
    return false;
  }
  return SAFE_TOKEN.test(value) && !hasStructuredSecret(value);
}

function safeId(value: string): boolean {
  return SAFE_ID.test(value) && !hasStructuredSecret(value);
}

function safeIdList(value: unknown): unknown {
  if (!Array.isArray(value) || value.length > MAX_LIST) {
    return AUDIT_REDACTED;
  }
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !safeId(item)) {
      return AUDIT_REDACTED;
    }
    ids.push(item);
  }
  return ids;
}

function safeFieldNames(value: unknown): unknown {
  if (!Array.isArray(value) || value.length > MAX_KEYS) {
    return AUDIT_REDACTED;
  }
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !SAFE_FIELD_NAME.test(item)) {
      return AUDIT_REDACTED;
    }
    names.push(item);
  }
  return names;
}

function safeLabel(value: string): string | typeof AUDIT_REDACTED {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return AUDIT_REDACTED;
  }
  if (scanText(trimmed) !== trimmed) {
    return AUDIT_REDACTED;
  }
  if (hasStructuredSecret(trimmed)) {
    return AUDIT_REDACTED;
  }
  if (LABEL_NARRATIVE.test(fold(trimmed))) {
    return AUDIT_REDACTED;
  }
  return trimmed;
}

function hasStructuredSecret(value: string): boolean {
  const scanned = scanText(value);
  if (value.length > 200 || scanned.length > 200) {
    return true;
  }
  if (EMAIL.test(scanned) || JWT.test(scanned) || SECRET_MATERIAL.test(scanned)) {
    return true;
  }
  if (looksLikeCpf(scanned) || looksLikeCnpj(scanned) || looksLikePhone(scanned)) {
    return true;
  }
  if (/^\d{4,}$/.test(scanned)) {
    return true;
  }
  return false;
}

function looksLikeCpf(value: string): boolean {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 11) {
    return false;
  }
  return /^[\d.\-\s]+$/.test(trimmed);
}

function looksLikeCnpj(value: string): boolean {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 14) {
    return false;
  }
  return /^[\d.\-/\s]+$/.test(trimmed);
}

function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[+\d\s().-]{8,20}$/.test(trimmed)) {
    return false;
  }
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const CONFUSABLES: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ѕ: "s",
  һ: "h",
  ј: "j",
  к: "k",
  м: "m",
  н: "h",
  т: "t",
  ο: "o",
  ρ: "p",
  τ: "t",
  ν: "v",
  κ: "k",
  ι: "i",
  α: "a",
  ε: "e",
  μ: "m",
};

function scanText(value: string): string {
  return value
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]/g, "")
    .normalize("NFKC");
}

function mapConfusables(value: string): string {
  let out = "";
  for (const ch of value) {
    out += CONFUSABLES[ch] ?? ch;
  }
  return out;
}

function fold(value: string): string {
  return mapConfusables(scanText(value))
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
