/**
 * Escalas e atividades do ministério aberto.
 * Só entra o que a API devolve com o mesmo ministryId.
 * Interesse de voluntariado continua no adaptador formal e não vira integrante.
 */

import { loadMinistryDesk, readMinistryActivities, type DeskResult, type MinistryActivity } from "./ministry-desk";
import type { AssignmentStatus } from "./serving-rosters";

export const ROSTER_LOCATION_LABELS = { sector: "Setor", zone: "Zona", side: "Lado" } as const;
export type RosterLocation = Partial<Record<keyof typeof ROSTER_LOCATION_LABELS, string | null>>;
export type EscalaAssignment = {
  id: string; personId: string; partnerPersonId: string; status: AssignmentStatus;
  personName: string; partnerName: string; substituteForId?: string; declinedAt?: string;
  personResponseStatus?: AssignmentStatus; partnerResponseStatus?: AssignmentStatus;
};
export type EscalaPosition = RosterLocation & { id: string; label: string; requiresCouple: boolean; requiredQualification?: string; assignments: EscalaAssignment[] };
export const ROSTER_SERVICE_TYPES = {
  thursday_evening: "Quinta à noite", sunday_morning: "Domingo de manhã",
  sunday_evening: "Domingo à noite", special_event: "Evento especial",
} as const;
export type RosterServiceType = keyof typeof ROSTER_SERVICE_TYPES;
export type ModulePosition = RosterLocation & { label: string; count: number; couple: boolean; qualification?: string };
export type EscalaModuleRules = {
  positions: Partial<Record<RosterServiceType, ModulePosition[]>>;
  qualifications: Record<string, string[]>;
  volunteerIds?: string[];
  couples: [string, string][];
  minIntervalDays: number;
  maxMonthlyAssignments: number; substituteInviteLimit: number; substituteInviteHours?: number;
};
export type EscalaModule = { id: string; name: string; rules?: EscalaModuleRules };

export type RosterCapacityGroup = {
  id: string;
  label: string;
  defaultCount: number;
  count: number;
  minimumCount: number;
};

export type RosterPermissions = { scope: "ministry" | "modules"; manageModuleMemberships: boolean };

export type MinistryEscala = {
  id: string;
  moduleId?: string;
  title: string;
  serviceAt: string;
  status: string;
  functions: string[];
  assignedCount: number;
  positions?: EscalaPosition[];
  capacity?: RosterCapacityGroup[];
};

export type EscalaPanel =
  | { kind: "hidden" }
  | { kind: "ready"; items: MinistryEscala[]; modules?: EscalaModule[]; permissions?: RosterPermissions }
  | { kind: "denied"; message: string }
  | { kind: "unavailable"; message: string };

export type ActivityPanel =
  | { kind: "hidden" }
  | { kind: "ready"; items: MinistryActivity[] }
  | { kind: "denied"; message: string }
  | { kind: "unavailable"; message: string };

export type MinistryBoardData = {
  desk: DeskResult;
  escalas: EscalaPanel;
  activities: ActivityPanel;
};

type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; text: () => Promise<string> }>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const raw = await response.text();
  if (!raw) return { status: response.status, body: null };
  try {
    return { status: response.status, body: JSON.parse(raw) as unknown };
  } catch {
    return { status: response.status, body: null };
  }
}

/** Descarta escala de outro ministério, mesmo que venha no mesmo pacote. */
export function readScopedEscalas(body: unknown, ministryId: string): MinistryEscala[] | null {
  const rows = asRecord(body)?.rosters;
  if (!Array.isArray(rows)) return null;
  const items: MinistryEscala[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    const id = textOf(row?.id);
    const title = textOf(row?.title);
    const serviceAt = textOf(row?.serviceAt);
    const owner = textOf(row?.ministryId);
    if (!row || !id || !title || !serviceAt || owner !== ministryId) continue;
    if (!Number.isFinite(Date.parse(serviceAt))) continue;
    const slots = Array.isArray(row.slots) ? row.slots : [];
    const functions: string[] = [];
    const positions: EscalaPosition[] = [];
    let assignedCount = 0;
    for (const slot of slots) {
      const card = asRecord(slot);
      const label = textOf(card?.roleLabel);
      if (label) functions.push(label);
      const assignments = Array.isArray(card?.assignments) ? card.assignments : [];
      const assigned = assignments.flatMap<EscalaAssignment>(assignment => {
        const item = asRecord(assignment);
        const status = textOf(item?.status);
        const id = textOf(item?.id), personId = textOf(item?.personId);
        if (!id || !personId || (status !== "PENDING" && status !== "CONFIRMED" && status !== "DECLINED" && status !== "SUBSTITUTED")) return [];
        if (status === "PENDING" || status === "CONFIRMED") assignedCount += textOf(item?.partnerPersonId) ? 2 : 1;
        return [{
          id, personId, status, partnerPersonId: textOf(item?.partnerPersonId),
          personName: textOf(item?.personName), partnerName: textOf(item?.partnerName),
          substituteForId: textOf(item?.substituteForId),
          declinedAt: textOf(item?.declinedAt),
          ...(readResponse(item?.personResponseStatus) ? { personResponseStatus: readResponse(item?.personResponseStatus) } : {}),
          ...(readResponse(item?.partnerResponseStatus) ? { partnerResponseStatus: readResponse(item?.partnerResponseStatus) } : {}),
        }];
      });
      const id = textOf(card?.id);
      if (id && label) positions.push({
        id, label, requiresCouple: card?.requiresCouple === true,
        sector: textOf(card?.sector), zone: textOf(card?.zone), side: textOf(card?.side),
        requiredQualification: textOf(card?.requiredQualification), assignments: assigned,
      });
    }
    const capacity = readCapacity(row.capacity);
    items.push({
      id,
      ...(textOf(row.moduleId) ? { moduleId: textOf(row.moduleId) } : {}),
      title,
      serviceAt,
      status: textOf(row.status) || "DRAFT",
      functions,
      assignedCount,
      ...(positions.length ? { positions } : {}),
      ...(capacity.length ? { capacity } : {}),
    });
  }
  items.sort((a, b) => Date.parse(a.serviceAt) - Date.parse(b.serviceAt) || a.title.localeCompare(b.title, "pt-BR"));
  return items;
}

function readResponse(value: unknown): AssignmentStatus | undefined {
  if (value === "PENDING" || value === "CONFIRMED" || value === "DECLINED") return value;
}

function readCapacity(value: unknown): RosterCapacityGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const row = asRecord(item);
    const id = textOf(row?.id);
    const label = textOf(row?.label);
    if (!id || !label || !row) return [];
    const { defaultCount, count, minimumCount } = row;
    if (![defaultCount, count, minimumCount].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0) ||
      Number(minimumCount) > Number(count)) return [];
    return [{ id, label, defaultCount: Number(defaultCount), count: Number(count), minimumCount: Number(minimumCount) }];
  });
}

export function rosterCapacitySummary(positions: readonly EscalaPosition[]) {
  const result = { single: 0, singleFilled: 0, couples: 0, couplesFilled: 0 };
  for (const position of positions) {
    const active = position.assignments.find(item => item.status === "PENDING" || item.status === "CONFIRMED");
    if (position.requiresCouple) {
      result.couples++;
      if (active?.partnerPersonId) result.couplesFilled++;
    } else {
      result.single++;
      if (active) result.singleFilled++;
    }
  }
  return result;
}

export function rosterModuleContains(module: EscalaModule, personId: string) {
  return Array.isArray(module.rules?.volunteerIds) && module.rules.volunteerIds.includes(personId);
}

export function rosterPositionSummary(positions: readonly EscalaPosition[]) {
  const summary = { open: 0, pending: 0, confirmed: 0 };
  for (const position of positions) {
    if (position.assignments.some(item => item.status === "PENDING")) summary.pending++;
    else if (position.assignments.some(item => item.status === "CONFIRMED")) summary.confirmed++;
    else summary.open++;
  }
  return summary;
}

function readEscalaModules(body: unknown, ministryId: string): EscalaModule[] {
  const result = asRecord(body);
  if (result?.ministryId !== ministryId || !Array.isArray(result.modules)) return [];
  return result.modules.flatMap((value) => {
    const row = asRecord(value);
    const id = textOf(row?.id);
    const name = textOf(row?.name);
    return id && name ? [{ id, name, ...(asRecord(row?.rules) ? { rules: row?.rules as EscalaModuleRules } : {}) }] : [];
  });
}

function readRosterPermissions(body: unknown, ministryId: string): RosterPermissions | undefined {
  const result = asRecord(body);
  if (result?.ministryId !== ministryId) return;
  const permissions = asRecord(result.permissions);
  const scope = permissions?.scope;
  if (scope === "ministry" || scope === "modules") {
    return { scope, manageModuleMemberships: permissions?.manageModuleMemberships === true };
  }
}

export function readScopedActivities(body: unknown, ministryId: string): MinistryActivity[] | null {
  return readMinistryActivities(asRecord(body)?.events, ministryId);
}

function presentList<T>(
  status: number,
  parsed: T[] | null,
  denied: string,
  unavailable: string,
): { kind: "ready"; items: T[] } | { kind: "denied"; message: string } | { kind: "unavailable"; message: string } {
  if (status === 403) return { kind: "denied", message: denied };
  if (status === 200 && parsed) return { kind: "ready", items: parsed };
  return { kind: "unavailable", message: unavailable };
}

export async function loadMinistryBoard(options: {
  token: string;
  baseUrl: string;
  ministryId?: string;
  ministrySlug?: string;
  fetchImpl?: FetchLike;
}): Promise<MinistryBoardData> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const desk = await loadMinistryDesk({
    token: options.token,
    baseUrl: options.baseUrl,
    ministryId: options.ministryId,
    ministrySlug: options.ministrySlug,
    fetchImpl,
  });
  if (desk.kind !== "ready") {
    return { desk, escalas: { kind: "hidden" }, activities: { kind: "hidden" } };
  }
  const base = options.baseUrl.replace(/\/$/, "");
  const ministryId = desk.ministry.id;
  const [escalaRes, legacyActivityRes] = await Promise.all([
    requestJson(fetchImpl, `${base}/rosters/by-ministry/${encodeURIComponent(ministryId)}`, options.token),
    desk.agenda.kind === "blocked" && desk.agenda.code === "MINISTRY_AGENDA_MODEL_BLOCKED"
      ? requestJson(fetchImpl, `${base}/events`, options.token)
      : null,
  ]);
  const escalas = presentList(
    escalaRes.status,
    readScopedEscalas(escalaRes.body, ministryId),
    "Esta conta não vê as escalas deste ministério.",
    "As escalas deste ministério não puderam ser lidas.",
  );
  const modules = readEscalaModules(escalaRes.body, ministryId);
  const permissions = readRosterPermissions(escalaRes.body, ministryId);
  const scopedModuleIds = new Set(modules.map(module => module.id));
  const items = escalas.kind === "ready" && permissions?.scope === "modules"
    ? escalas.items.filter(roster => roster.moduleId && scopedModuleIds.has(roster.moduleId))
    : escalas.kind === "ready" ? escalas.items : [];
  return {
    desk,
    escalas: escalas.kind === "ready" ? {
      ...escalas, items, ...(modules.length ? { modules } : {}), ...(permissions ? { permissions } : {}),
    } : escalas,
    activities: desk.agenda.kind === "ready" ? { kind: "ready", items: desk.agenda.items } : presentList(
      legacyActivityRes?.status ?? (desk.agenda.kind === "denied" ? 403 : 0),
      readScopedActivities(legacyActivityRes?.body, ministryId),
      "Esta conta não vê as atividades deste ministério.",
      "As atividades deste ministério não puderam ser lidas.",
    ),
  };
}
