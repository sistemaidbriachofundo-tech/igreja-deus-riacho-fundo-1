export const REGISTRATION_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "CANCELLED",
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

const PERSONAL_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PERSONAL_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const PERSONAL_PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}-\d{4}/;

export function textLooksPersonal(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    PERSONAL_EMAIL.test(value) ||
    PERSONAL_CPF.test(value) ||
    PERSONAL_PHONE.test(value)
  );
}

export interface ParticipationSource {
  id: string;
  eventId: string;
  eventName: string;
  displayName: string;
  partySize: number;
  isMinor: boolean;
  guardianDisplayName?: string | null;
  status: string;
  checkedInAt: string | null;
  checkInCode?: string | null;
}

export interface ParticipationRow {
  registrationId: string;
  eventId: string;
  eventName: string;
  status: string;
  partySize: number;
  checkedInAt: string | null;
  syntheticLabel: string | null;
  labelRedacted: boolean;
}

export interface ParticipationCounts {
  registrations: number;
  cancelled: number;
  checkedIn: number;
  pendingPayment: number;
  confirmedAwaitingPresence: number;
  unclassified: number;
  participants: number;
  presentParticipants: number;
  minorsOmitted: number;
  labelsRedacted: number;
}

export function emptyParticipationCounts(): ParticipationCounts {
  return {
    registrations: 0,
    cancelled: 0,
    checkedIn: 0,
    pendingPayment: 0,
    confirmedAwaitingPresence: 0,
    unclassified: 0,
    participants: 0,
    presentParticipants: 0,
    minorsOmitted: 0,
    labelsRedacted: 0,
  };
}

/**
 * Uma inscrição conta uma vez, mesmo se a consulta devolver a mesma linha duas vezes.
 * Menor não entra na lista. Código de check-in nunca entra no resultado.
 */
export function summarizeParticipation(input: readonly ParticipationSource[]): {
  counts: ParticipationCounts;
  rows: ParticipationRow[];
} {
  const unique = new Map<string, ParticipationSource>();
  for (const row of input) {
    if (!row.id || unique.has(row.id)) continue;
    unique.set(row.id, row);
  }

  const counts = emptyParticipationCounts();
  const rows: ParticipationRow[] = [];
  for (const row of unique.values()) {
    const party =
      Number.isInteger(row.partySize) && row.partySize > 0 ? row.partySize : 0;
    counts.registrations += 1;
    if (row.status === "CANCELLED") {
      counts.cancelled += 1;
    } else {
      counts.participants += party;
    }
    if (row.status === "CHECKED_IN") {
      counts.checkedIn += 1;
      counts.presentParticipants += party;
    } else if (row.status === "PENDING_PAYMENT") {
      counts.pendingPayment += 1;
    } else if (row.status === "CONFIRMED") {
      counts.confirmedAwaitingPresence += 1;
    } else if (row.status !== "CANCELLED") {
      counts.unclassified += 1;
    }

    if (row.isMinor) {
      counts.minorsOmitted += 1;
      continue;
    }
    const redact = textLooksPersonal(row.displayName);
    if (redact) counts.labelsRedacted += 1;
    rows.push({
      registrationId: row.id,
      eventId: row.eventId,
      eventName: row.eventName,
      status: row.status,
      partySize: party,
      checkedInAt: row.checkedInAt,
      syntheticLabel: redact ? null : row.displayName,
      labelRedacted: redact,
    });
  }
  return { counts, rows };
}

export function countsAreBalanced(counts: ParticipationCounts): boolean {
  return (
    counts.registrations ===
    counts.cancelled +
      counts.checkedIn +
      counts.pendingPayment +
      counts.confirmedAwaitingPresence +
      counts.unclassified
  );
}
