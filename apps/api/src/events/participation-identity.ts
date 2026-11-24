/** Identidade estável da mesma participação. Nome sozinho nunca cruza contas. */

const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function normalizeParticipantEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

export function normalizeIdentityLabel(value: string | null | undefined): string | null {
  const label = (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
  if (label.length < 2 || label.length > 120) return null;
  return label;
}

export function participationIdentityKeys(input: {
  registrantPersonId?: string | null;
  isMinor: boolean;
  partySize: number;
  displayName?: string | null;
  notificationEmail?: string | null;
  participants?: Array<{ email?: string | null }>;
}): string[] {
  const emails = [...new Set((input.participants ?? []).flatMap(person => {
    const email = normalizeParticipantEmail(person.email);
    return email ? [`email:${email}`] : [];
  }))].sort();
  if (emails.length) return emails;

  const keys: string[] = [];
  if (input.registrantPersonId && !input.isMinor) keys.push(`person:${input.registrantPersonId}`);
  const mailbox = !input.isMinor && input.partySize <= 1
    ? normalizeParticipantEmail(input.notificationEmail)
    : null;
  if (mailbox) keys.push(`email:${mailbox}`);
  if (!keys.length && input.isMinor && input.registrantPersonId) {
    const name = normalizeIdentityLabel(input.displayName);
    if (name) keys.push(`dependent:${input.registrantPersonId}:${name}`);
  }
  return [...new Set(keys)].sort();
}

/** Cancelada, estornada ou evento encerrado não bloqueia e não é mesclada. */
export function participationStillBlocks(input: {
  status: string;
  paymentStatus: string;
  eventStatus?: string | null;
}): boolean {
  if (input.eventStatus === "CANCELLED" || input.eventStatus === "ARCHIVED") return false;
  if (input.status === "CANCELLED") return false;
  if (input.paymentStatus === "REFUNDED" || input.paymentStatus === "CANCELLED") return false;
  return input.status === "PENDING_PAYMENT" || input.status === "CONFIRMED" || input.status === "CHECKED_IN";
}

export type HeldParticipation = {
  registrationId: string;
  registrantPersonId: string | null;
  status: string;
  keys: string[];
};

export function classifyParticipationOverlap(incoming: string[], held: HeldParticipation[]) {
  if (!incoming.length) return { kind: "none" as const, matches: [] as HeldParticipation[] };
  const wanted = new Set(incoming);
  const matches = held.filter(row => row.keys.some(key => wanted.has(key)));
  if (!matches.length) return { kind: "none" as const, matches };
  const covered = new Set(matches.flatMap(row => row.keys.filter(key => wanted.has(key))));
  const accountKeys = incoming.filter(key => key.startsWith("person:") || key.startsWith("dependent:"));
  const sameAccount = accountKeys.length > 0 && accountKeys.every(key => covered.has(key));
  return {
    kind: sameAccount || covered.size === wanted.size ? "full" as const : "partial" as const,
    matches,
  };
}

export function preferredOwned(
  matches: HeldParticipation[],
  registrantPersonId: string | null | undefined,
): { id: string; status: string } | null {
  if (!registrantPersonId) return null;
  const owned = matches.filter(row => row.registrantPersonId === registrantPersonId);
  owned.sort((a, b) => b.keys.length - a.keys.length || a.registrationId.localeCompare(b.registrationId));
  const chosen = owned[0];
  return chosen ? { id: chosen.registrationId, status: chosen.status } : null;
}
