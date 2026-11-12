/**
 * Escalas e atividades do ministério aberto.
 * Só entra o que a API devolve com o mesmo ministryId.
 * Interesse de voluntariado continua no adaptador formal e não vira integrante.
 */

import { loadMinistryDesk, type DeskResult } from "./ministry-desk";

export type EscalaAssignment = { id: string; personId: string; partnerPersonId: string; status: string; personName: string; partnerName: string };
export type EscalaPosition = { id: string; label: string; requiresCouple: boolean; assignments: EscalaAssignment[] };

export type MinistryEscala = {
  id: string;
  title: string;
  serviceAt: string;
  status: string;
  functions: string[];
  assignedCount: number;
  positions?: EscalaPosition[];
};

export type MinistryActivity = {
  id: string;
  name: string;
  startsAt: string;
  locationText: string | null;
  status: string;
};

export type EscalaPanel =
  | { kind: "hidden" }
  | { kind: "ready"; items: MinistryEscala[] }
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
      const assigned = assignments.flatMap(assignment => {
        const item = asRecord(assignment);
        const status = textOf(item?.status);
        if (status !== "PENDING" && status !== "CONFIRMED") return [];
        assignedCount += 1;
        const id = textOf(item?.id), personId = textOf(item?.personId);
        return id && personId ? [{
          id, personId, status, partnerPersonId: textOf(item?.partnerPersonId),
          personName: textOf(item?.personName), partnerName: textOf(item?.partnerName),
        }] : [];
      });
      const id = textOf(card?.id);
      if (id && label) positions.push({ id, label, requiresCouple: card?.requiresCouple === true, assignments: assigned });
    }
    items.push({
      id,
      title,
      serviceAt,
      status: textOf(row.status) || "DRAFT",
      functions,
      assignedCount,
      ...(positions.length ? { positions } : {}),
    });
  }
  items.sort((a, b) => Date.parse(a.serviceAt) - Date.parse(b.serviceAt) || a.title.localeCompare(b.title, "pt-BR"));
  return items;
}

/** Atividade sem ministryId, ou de outro ministério, não aparece neste painel. */
export function readScopedActivities(body: unknown, ministryId: string): MinistryActivity[] | null {
  const rows = asRecord(body)?.events;
  if (!Array.isArray(rows)) return null;
  const items: MinistryActivity[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    const id = textOf(row?.id);
    const name = textOf(row?.name);
    const startsAt = textOf(row?.startsAt);
    if (!row || !id || !name || !startsAt || textOf(row.ministryId) !== ministryId) continue;
    if (!Number.isFinite(Date.parse(startsAt))) continue;
    const location = textOf(row.locationText);
    items.push({
      id,
      name,
      startsAt,
      locationText: location || null,
      status: textOf(row.status) || "DRAFT",
    });
  }
  items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.name.localeCompare(b.name, "pt-BR"));
  return items;
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
  fetchImpl?: FetchLike;
}): Promise<MinistryBoardData> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const desk = await loadMinistryDesk({
    token: options.token,
    baseUrl: options.baseUrl,
    ministryId: options.ministryId,
    fetchImpl,
  });
  if (desk.kind !== "ready") {
    return { desk, escalas: { kind: "hidden" }, activities: { kind: "hidden" } };
  }
  const base = options.baseUrl.replace(/\/$/, "");
  const ministryId = desk.ministry.id;
  const [escalaRes, activityRes] = await Promise.all([
    requestJson(fetchImpl, `${base}/rosters/by-ministry/${encodeURIComponent(ministryId)}`, options.token),
    requestJson(fetchImpl, `${base}/events`, options.token),
  ]);
  return {
    desk,
    escalas: presentList(
      escalaRes.status,
      readScopedEscalas(escalaRes.body, ministryId),
      "Esta conta não vê as escalas deste ministério.",
      "As escalas deste ministério não puderam ser lidas.",
    ),
    activities: presentList(
      activityRes.status,
      readScopedActivities(activityRes.body, ministryId),
      "Esta conta não vê as atividades deste ministério.",
      "As atividades deste ministério não puderam ser lidas.",
    ),
  };
}
