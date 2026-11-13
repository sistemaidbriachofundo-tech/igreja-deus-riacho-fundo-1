import type { DasRecord } from "./das-operations";

const PERSONAL_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PERSONAL_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const PERSONAL_PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}-\d{4}/;

export type ManagedEvent = {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string;
  locationText: string;
  startsAt: string;
  paymentAccountId?: string | null;
};

export type EventPaymentAccount = { id: string; name: string };

export function readEventPaymentAccounts(value: unknown): EventPaymentAccount[] | null {
  if (!value || typeof value !== "object" || !("accounts" in value) || !Array.isArray(value.accounts)) return null;
  return value.accounts.flatMap((account: unknown) => {
    if (!account || typeof account !== "object" || !("id" in account) || !("name" in account)) return [];
    const id = text(account.id);
    const name = text(account.name);
    return id && name ? [{ id, name }] : [];
  });
}

export type ManagedRegistration = {
  id: string;
  status: string;
  partySize: number;
  isMinor: boolean;
  displayName: string;
  checkInCode: string;
  paymentStatus: string;
};

export type ParticipationCounts = {
  registrations: number;
  checkedIn: number;
  participants: number;
  presentParticipants: number;
  minorsOmitted: number;
  cancelled: number;
  pendingPayment: number;
  confirmedAwaitingPresence: number;
};

export type ParticipationView = {
  counts: ParticipationCounts;
  rows: Array<{
    registrationId: string;
    syntheticLabel: string | null;
    status: string;
    partySize: number;
    labelRedacted: boolean;
  }>;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function publicationBlockReason(event: {
  name: string;
  slug: string;
  description: string;
  locationText: string;
}): string | null {
  const joined = [event.name, event.slug, event.description, event.locationText].join("\n");
  if (PERSONAL_EMAIL.test(joined) || PERSONAL_CPF.test(joined) || PERSONAL_PHONE.test(joined)) {
    return "Publicação bloqueada: revise nome, descrição ou local. O texto parece conter e-mail, telefone ou CPF.";
  }
  return null;
}

export function toManagedEvent(row: DasRecord): ManagedEvent | null {
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    name: text(row.name),
    slug: text(row.slug),
    status: text(row.status) || "DRAFT",
    description: text(row.description),
    locationText: text(row.locationText),
    startsAt: text(row.startsAt),
    ...(row.paymentAccountId === null || typeof row.paymentAccountId === "string"
      ? { paymentAccountId: row.paymentAccountId }
      : {}),
  };
}

/** Menor não leva nome, responsável nem código para a interface. */
export function toManagedRegistration(row: DasRecord): ManagedRegistration | null {
  const id = text(row.id);
  if (!id) return null;
  const isMinor = row.isMinor === true;
  const partySize = typeof row.partySize === "number" && Number.isInteger(row.partySize) ? row.partySize : 0;
  return {
    id,
    status: text(row.status),
    partySize,
    isMinor,
    displayName: isMinor ? "" : text(row.displayName),
    checkInCode: isMinor ? "" : text(row.checkInCode),
    paymentStatus: text(row.paymentStatus),
  };
}

export function canRecordPresence(row: ManagedRegistration): boolean {
  return !row.isMinor
    && row.status === "CONFIRMED"
    && row.paymentStatus === "CONFIRMED_MOCK"
    && row.checkInCode.length >= 8;
}

export function registrationLabel(row: ManagedRegistration): string {
  if (row.isMinor) return "Registro de menor omitido";
  return row.displayName || "Inscrição sem rótulo";
}

export function participationQuery(filters: {
  eventId?: string;
  status?: string;
  from?: string;
  to?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00.000Z`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59.000Z`).toISOString());
  const query = params.toString();
  return `/reports/participation${query ? `?${query}` : ""}`;
}

export function readParticipation(payload: unknown): ParticipationView | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { counts?: Partial<ParticipationCounts>; rows?: unknown };
  if (!body.counts || typeof body.counts !== "object") return null;
  const count = (key: keyof ParticipationCounts) =>
    typeof body.counts?.[key] === "number" ? body.counts[key] : null;
  const counts = {
    registrations: count("registrations"),
    checkedIn: count("checkedIn"),
    participants: count("participants"),
    presentParticipants: count("presentParticipants"),
    minorsOmitted: count("minorsOmitted"),
    cancelled: count("cancelled"),
    pendingPayment: count("pendingPayment"),
    confirmedAwaitingPresence: count("confirmedAwaitingPresence"),
  };
  if (Object.values(counts).some((value) => value === null)) return null;
  const rows = Array.isArray(body.rows) ? body.rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const registrationId = text(row.registrationId);
    if (!registrationId) return [];
    return [{
      registrationId,
      syntheticLabel: row.labelRedacted === true ? null : text(row.syntheticLabel) || null,
      status: text(row.status),
      partySize: typeof row.partySize === "number" ? row.partySize : 0,
      labelRedacted: row.labelRedacted === true,
    }];
  }) : [];
  return { counts: counts as ParticipationCounts, rows };
}

export function countLines(report: {
  byStatus?: Record<string, number>;
  adultsByStatus?: Record<string, number>;
  minorsOmitted?: number;
  adultVisitorsActive?: number;
  countsMatch?: boolean;
  formalMembership?: { blocked?: boolean; code?: string; members?: null };
  ministries?: Array<{
    name?: string;
    publishStatus?: string;
    eventsByStatus?: Record<string, number>;
    volunteerInterestsByStatus?: Record<string, number>;
    formalMembers?: null;
  }>;
  unassignedEvents?: number | null;
}): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [];
  for (const [status, value] of Object.entries(report.byStatus ?? {})) {
    lines.push({ label: `Membresia ${status}`, value: String(value) });
  }
  for (const [status, value] of Object.entries(report.adultsByStatus ?? {})) {
    lines.push({ label: `Adultos ${status}`, value: String(value) });
  }
  if (typeof report.minorsOmitted === "number") {
    lines.push({ label: "Menores omitidos", value: String(report.minorsOmitted) });
  }
  if (typeof report.adultVisitorsActive === "number") {
    lines.push({ label: "Visitantes adultos ativos", value: String(report.adultVisitorsActive) });
  }
  if (typeof report.countsMatch === "boolean") {
    lines.push({ label: "Contagens conferem", value: report.countsMatch ? "sim" : "não" });
  }
  if (report.formalMembership) {
    lines.push({
      label: "Integrantes formais",
      value: report.formalMembership.blocked ? "BLOCKED" : "indisponível",
    });
  }
  if (typeof report.unassignedEvents === "number") {
    lines.push({ label: "Eventos sem ministério", value: String(report.unassignedEvents) });
  }
  for (const ministry of report.ministries ?? []) {
    const name = ministry.name || "Ministério";
    lines.push({ label: `${name} · publicação`, value: ministry.publishStatus || "—" });
    for (const [status, value] of Object.entries(ministry.eventsByStatus ?? {})) {
      lines.push({ label: `${name} · eventos ${status}`, value: String(value) });
    }
    for (const [status, value] of Object.entries(ministry.volunteerInterestsByStatus ?? {})) {
      lines.push({ label: `${name} · interesses ${status}`, value: String(value) });
    }
    lines.push({ label: `${name} · integrantes formais`, value: "BLOCKED" });
  }
  return lines;
}
