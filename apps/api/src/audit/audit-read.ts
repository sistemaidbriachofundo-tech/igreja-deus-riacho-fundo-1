import {
  evaluateAccess,
  isPlatformAdminInOrg,
  type AuthGrant,
} from "@idbrf/shared";
import {
  AUDIT_ACTION_PATTERN,
  AUDIT_ID_PATTERN,
  AUDIT_OUTCOMES,
  AUDIT_RESOURCE_TYPE_PATTERN,
  classifyAuditEvent,
  type AuditOutcome,
  type AuditSensitivity,
} from "./audit-command";

export const AUDIT_PAGE_MAX = 200;
export const AUDIT_RANGE_MAX_DAYS = 1825;

export class AuditFilterError extends Error {
  readonly code = "FILTER";

  constructor() {
    super("Filtro de auditoria inválido.");
    this.name = "AuditFilterError";
  }
}

export interface AuditVisibility {
  hideFinancial: boolean;
  hidePastoral: boolean;
}

export interface AuditCursor {
  createdAt: Date;
  id: string;
}

export interface ParsedAuditQuery {
  take: number;
  action?: string;
  resourceType?: string;
  from?: Date;
  to?: Date;
  outcome?: AuditOutcome;
  cursor?: AuditCursor;
}

/**
 * Secretaria não vê tipo financeiro nem pastoral.
 * Pastor vê pastoral e não vê tipo financeiro.
 * PLATFORM_ADMIN mantém a trilha dos dois, com metadata já redigida.
 * Tesouraria não chega aqui: a rota de leitura não inclui esse papel.
 */
export function auditVisibilityFor(
  grants: AuthGrant[],
  scope: { organizationId: string; churchId: string | null },
): AuditVisibility {
  if (isPlatformAdminInOrg(grants, scope.organizationId)) {
    return { hideFinancial: false, hidePastoral: false };
  }
  const request = {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
  };
  return {
    hidePastoral: !evaluateAccess(grants, {
      resource: "pastoral",
      action: "read",
      ...request,
    }).allow,
    hideFinancial: !evaluateAccess(grants, {
      resource: "ledger",
      action: "read",
      ...request,
    }).allow,
  };
}

export function eventVisible(
  visibility: AuditVisibility,
  action: string,
  resourceType?: string | null,
): boolean {
  const kind = classifyAuditEvent(action, resourceType);
  if (kind === "financial" && visibility.hideFinancial) {
    return false;
  }
  if (kind === "pastoral" && visibility.hidePastoral) {
    return false;
  }
  return true;
}

export function sensitivityWhere(
  visibility: AuditVisibility,
): Record<string, unknown> | undefined {
  const or: Record<string, unknown>[] = [];
  if (visibility.hidePastoral) {
    or.push(
      { action: { startsWith: "pastoral." } },
      { action: { contains: "pastoral" } },
      { action: { contains: "oracao" } },
      { action: { contains: "aconselh" } },
      { resourceType: { startsWith: "pastoral" } },
    );
  }
  if (visibility.hideFinancial) {
    or.push(
      { action: { startsWith: "ledger." } },
      { action: { startsWith: "treasury." } },
      { action: { startsWith: "finance." } },
      { action: { contains: "ledger" } },
      { action: { contains: "treasury" } },
      { action: { contains: "tesouraria" } },
      { action: { contains: "finance" } },
      { resourceType: { startsWith: "ledger" } },
      { resourceType: { startsWith: "treasury" } },
    );
  }
  if (or.length === 0) {
    return undefined;
  }
  return { NOT: { OR: or } };
}

export function clampAuditLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 50;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), AUDIT_PAGE_MAX);
}

export function parseAuditQuery(
  limit: number | undefined,
  options?: {
    cursor?: string;
    action?: string;
    resourceType?: string;
    from?: string;
    to?: string;
    outcome?: string;
    churchId?: string;
    scope?: string;
  },
): ParsedAuditQuery {
  if (
    options?.scope !== undefined &&
    options.scope !== "" &&
    options.scope !== "organization" &&
    options.scope !== "church"
  ) {
    throw new AuditFilterError();
  }
  if (
    options?.churchId !== undefined &&
    options.churchId !== "" &&
    !AUDIT_ID_PATTERN.test(options.churchId)
  ) {
    throw new AuditFilterError();
  }
  const action = optionalToken(options?.action, AUDIT_ACTION_PATTERN);
  const resourceType = optionalToken(
    options?.resourceType,
    AUDIT_RESOURCE_TYPE_PATTERN,
  );
  const outcome = parseOutcome(options?.outcome);
  const { from, to } = parseRange(options?.from, options?.to);
  const cursor = options?.cursor ? decodeAuditCursor(options.cursor) : undefined;
  return {
    take: clampAuditLimit(limit),
    ...(action ? { action } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(outcome ? { outcome } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

export function buildAuditWhere(input: {
  organizationId: string;
  churchId: string | null;
  scope: "organization" | "church";
  query: ParsedAuditQuery;
  visibility: AuditVisibility;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {
    organizationId: input.organizationId,
  };
  if (input.scope === "church") {
    where.churchId = input.churchId;
  }
  if (input.query.action) {
    where.action = input.query.action;
  }
  if (input.query.resourceType) {
    where.resourceType = input.query.resourceType;
  }
  if (input.query.from || input.query.to) {
    where.createdAt = {
      ...(input.query.from ? { gte: input.query.from } : {}),
      ...(input.query.to ? { lte: input.query.to } : {}),
    };
  }
  if (input.query.outcome) {
    where.metadata = { path: ["outcome"], equals: input.query.outcome };
  }
  const and = [
    sensitivityWhere(input.visibility),
    input.query.cursor ? cursorWhere(input.query.cursor) : undefined,
  ].filter((part): part is Record<string, unknown> => part !== undefined);
  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}

export function encodeAuditCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ t: row.createdAt.toISOString(), i: row.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeAuditCursor(cursor: string): AuditCursor {
  if (cursor.length < 8 || cursor.length > 512) {
    throw new AuditFilterError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new AuditFilterError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AuditFilterError();
  }
  const record = parsed as { t?: unknown; i?: unknown };
  if (typeof record.t !== "string" || typeof record.i !== "string") {
    throw new AuditFilterError();
  }
  if (!AUDIT_ID_PATTERN.test(record.i) || !/^\d{4}-\d{2}-\d{2}T/.test(record.t)) {
    throw new AuditFilterError();
  }
  const createdAt = new Date(record.t);
  if (Number.isNaN(createdAt.getTime())) {
    throw new AuditFilterError();
  }
  return { createdAt, id: record.i };
}

export function readStoredOutcome(metadata: unknown): AuditOutcome | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const outcome = (metadata as { outcome?: unknown }).outcome;
  if (
    typeof outcome === "string" &&
    (AUDIT_OUTCOMES as readonly string[]).includes(outcome)
  ) {
    return outcome as AuditOutcome;
  }
  return null;
}

export function sensitivityOf(
  action: string,
  resourceType?: string | null,
): AuditSensitivity {
  return classifyAuditEvent(action, resourceType);
}

function cursorWhere(cursor: AuditCursor): Record<string, unknown> {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      {
        AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }],
      },
    ],
  };
}

function optionalToken(
  value: string | undefined,
  pattern: RegExp,
): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (!pattern.test(value)) {
    throw new AuditFilterError();
  }
  return value;
}

function parseOutcome(value: string | undefined): AuditOutcome | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (!(AUDIT_OUTCOMES as readonly string[]).includes(value)) {
    throw new AuditFilterError();
  }
  return value as AuditOutcome;
}

function parseRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
): { from?: Date; to?: Date } {
  const from = parseInstant(fromRaw);
  const to = parseInstant(toRaw);
  if (from && to && from.getTime() > to.getTime()) {
    throw new AuditFilterError();
  }
  if (
    from &&
    to &&
    to.getTime() - from.getTime() > AUDIT_RANGE_MAX_DAYS * 24 * 60 * 60 * 1000
  ) {
    throw new AuditFilterError();
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

function parseInstant(value: string | undefined): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) {
    throw new AuditFilterError();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AuditFilterError();
  }
  return parsed;
}
