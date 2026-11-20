import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Contratos puros do pacote de DEV aprovado para a API.
 * Não carrega segredo, texto pastoral nem dado de pessoa real.
 */

export const PUBLIC_PASSWORD_RESET_MESSAGE =
  "Se houver uma conta ativa para este e-mail, enviaremos um link de uso único.";

export function publicPasswordResetBody() {
  return { accepted: true as const, message: PUBLIC_PASSWORD_RESET_MESSAGE };
}

const EVENT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeResumeEventSlug(value: string | null | undefined): string | null {
  const slug = value?.trim().toLowerCase() ?? "";
  if (!slug || slug.length > 80 || !EVENT_SLUG.test(slug)) return null;
  return slug;
}

export type CredentialColorRule = "pastoral" | "lideranca" | "membro" | "pendente" | "inativa";

export function credentialColorRule(input: { status: string; roles?: readonly string[] | null }): {
  rule: CredentialColorRule;
  tone: "color";
} {
  const roles = input.roles ?? [];
  if (input.status === "ACTIVE" && roles.includes("PASTOR")) return { rule: "pastoral", tone: "color" };
  if (input.status === "ACTIVE" && roles.some(role => role === "MINISTRY_LEADER" || role === "EVANGELIST" || role === "DEACON")) {
    return { rule: "lideranca", tone: "color" };
  }
  if (input.status === "ACTIVE") return { rule: "membro", tone: "color" };
  if (input.status.startsWith("PENDING") || input.status === "DRAFT") return { rule: "pendente", tone: "color" };
  return { rule: "inativa", tone: "color" };
}

const DOC_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function officeDocumentKind(bytes: Uint8Array, contentType: string): "doc" | "docx" | null {
  const type = contentType.trim().toLowerCase();
  if (bytes.length < 8 || bytes.length > 5_000_000) return null;
  const isDoc = DOC_MAGIC.every((byte, index) => bytes[index] === byte);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (isDoc && type === "application/msword") return "doc";
  if (isZip && type === DOCX_TYPE) return "docx";
  return null;
}

export type OperationalScopeKind = "MINISTRY" | "MODULE" | "GROUP" | "TRACK";

export function scopeCovers(input: {
  bindings: readonly { kind: OperationalScopeKind; scopeId: string }[];
  kind: OperationalScopeKind;
  scopeId: string;
}): boolean {
  const sameKind = input.bindings.filter(binding => binding.kind === input.kind);
  if (!sameKind.length) return true;
  return sameKind.some(binding => binding.scopeId === input.scopeId);
}

export interface SettingRevisionWindow {
  id: string;
  value: unknown;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export function effectiveSettingValue(input: {
  devValue: unknown;
  revisions: readonly SettingRevisionWindow[];
  at: string;
}): { source: "PUBLISHED" | "DEV"; value: unknown; revisionId: string | null } {
  const at = Date.parse(input.at);
  const chosen = input.revisions
    .filter(revision => {
      const from = Date.parse(revision.effectiveFrom);
      const until = revision.effectiveUntil ? Date.parse(revision.effectiveUntil) : Number.POSITIVE_INFINITY;
      return from <= at && at < until;
    })
    .sort((left, right) => Date.parse(right.effectiveFrom) - Date.parse(left.effectiveFrom))[0];
  if (!chosen) return { source: "DEV", value: input.devValue, revisionId: null };
  return { source: "PUBLISHED", value: chosen.value, revisionId: chosen.id };
}

export function windowsOverlap(
  left: { from: string; until: string | null },
  right: { from: string; until: string | null },
): boolean {
  const leftUntil = left.until ? Date.parse(left.until) : Number.POSITIVE_INFINITY;
  const rightUntil = right.until ? Date.parse(right.until) : Number.POSITIVE_INFINITY;
  return Date.parse(left.from) < rightUntil && Date.parse(right.from) < leftUntil;
}

const SAO_PAULO = "America/Sao_Paulo";

export function saoPauloParts(instant: Date): { date: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value.weekday);
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    minutes: Number(value.hour) * 60 + Number(value.minute),
    weekday,
  };
}

export function parseBrasiliaHour(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isBeforeConfiguredHour(now: Date, hour: string): boolean {
  const minutes = parseBrasiliaHour(hour);
  if (minutes == null) return true;
  return saoPauloParts(now).minutes < minutes;
}

export function louvorWeekBounds(serviceAt: Date): { start: Date; end: Date; key: string } {
  const local = saoPauloParts(serviceAt);
  const [year, month, day] = local.date.split("-").map(Number);
  const mondayOffset = local.weekday === 0 ? 6 : local.weekday - 1;
  const start = new Date(Date.UTC(year, month - 1, day - mondayOffset, 3, 0, 0));
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return { start, end, key: saoPauloParts(start).date };
}

export function sameLouvorWeek(left: Date, right: Date): boolean {
  return louvorWeekBounds(left).key === louvorWeekBounds(right).key;
}

export function eventCoversLocalDay(startsAt: Date, endsAt: Date | null, now: Date): boolean {
  const today = saoPauloParts(now).date;
  const start = saoPauloParts(startsAt).date;
  const end = saoPauloParts(endsAt ?? startsAt).date;
  return today >= start && today <= end;
}

export function paymentSettlement(grossCents: number, feeCents: number): { grossCents: number; feeCents: number; netCents: number } {
  if (!Number.isInteger(grossCents) || grossCents <= 0) throw new Error("Valor bruto inválido.");
  if (!Number.isInteger(feeCents) || feeCents < 0 || feeCents > grossCents) throw new Error("Taxa inválida.");
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}

export function mercadoPagoSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyMercadoPagoSignature(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  if (!secret || !timestamp || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = mercadoPagoSignature(secret, timestamp, rawBody);
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(signature, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type TicketScanResult =
  | { result: "READ"; checkedInAt: string }
  | { result: "ALREADY_READ"; checkedInAt: string; scannedByUserId: string | null }
  | { result: "WRONG_EVENT" }
  | { result: "UNPAID" }
  | { result: "UNKNOWN" }
  | { result: "NOT_TODAY" };

const CONFIRMED_PAYMENTS = new Set(["CONFIRMED_MOCK", "CONFIRMED_PIX", "CONFIRMED_GATEWAY"]);

export function decideTicketScan(input: {
  found: boolean;
  ticketEventId?: string | null;
  requestedEventId: string;
  paymentStatus?: string | null;
  registrationStatus?: string | null;
  onEventDay: boolean;
  checkedInAt?: string | null;
  scannedByUserId?: string | null;
  now: string;
}): TicketScanResult {
  if (!input.found) return { result: "UNKNOWN" };
  if (input.ticketEventId !== input.requestedEventId) return { result: "WRONG_EVENT" };
  if (!input.onEventDay) return { result: "NOT_TODAY" };
  if (input.registrationStatus === "CANCELLED" || !CONFIRMED_PAYMENTS.has(input.paymentStatus ?? "")) return { result: "UNPAID" };
  if (input.checkedInAt) return { result: "ALREADY_READ", checkedInAt: input.checkedInAt, scannedByUserId: input.scannedByUserId ?? null };
  return { result: "READ", checkedInAt: input.now };
}
