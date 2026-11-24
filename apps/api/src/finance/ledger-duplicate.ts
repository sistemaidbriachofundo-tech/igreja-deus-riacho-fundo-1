/** Compara lançamentos da mesma igreja sem tratar texto parecido como igual. */

export type LedgerLineRef = { accountId: string; side: string };

export type LedgerDuplicateCandidate = {
  id: string;
  status: string;
  description: string;
  entryDate: string;
  amountCents: number;
  costCenterId: string | null;
  lines: LedgerLineRef[];
};

const BLOCKING = new Set(["DRAFT", "PENDING_APPROVAL", "APPROVED"]);

export function formatEntryDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function normalizeLedgerDescription(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function ledgerLineSignature(lines: LedgerLineRef[]): string {
  return lines.map(line => `${line.side}:${line.accountId}`).sort().join("|");
}

export function sameLedgerFingerprint(
  candidate: Pick<LedgerDuplicateCandidate, "description" | "costCenterId" | "lines" | "status">,
  incoming: { description: string; costCenterId: string | null; lines: LedgerLineRef[] },
): boolean {
  if (!BLOCKING.has(candidate.status)) return false;
  if (normalizeLedgerDescription(candidate.description) !== normalizeLedgerDescription(incoming.description)) return false;
  if ((candidate.costCenterId ?? null) !== (incoming.costCenterId ?? null)) return false;
  return ledgerLineSignature(candidate.lines) === ledgerLineSignature(incoming.lines);
}

export type LedgerDuplicateView = {
  id: string;
  status: string;
  description: string;
  entryDate: string;
  amountCents: number;
};

export function reviewLedgerDuplicates(input: {
  candidates: LedgerDuplicateCandidate[];
  incoming: { description: string; costCenterId: string | null; lines: LedgerLineRef[] };
  acknowledgedId?: string | null;
}):
  | { action: "allow"; acknowledgedId?: string }
  | { action: "possible"; reason: "new" | "another" | "stale"; existing: LedgerDuplicateView } {
  const matches = input.candidates.filter(candidate => sameLedgerFingerprint(candidate, input.incoming));
  const acknowledgedId = input.acknowledgedId?.trim() || null;
  if (!acknowledgedId) {
    const existing = matches[0];
    return existing ? { action: "possible", reason: "new", existing: toView(existing) } : { action: "allow" };
  }
  const acknowledged = matches.find(candidate => candidate.id === acknowledgedId);
  if (!acknowledged) {
    const existing = matches[0];
    return existing
      ? { action: "possible", reason: "stale", existing: toView(existing) }
      : { action: "allow" };
  }
  const rest = matches.filter(candidate => candidate.id !== acknowledged.id);
  if (rest[0]) return { action: "possible", reason: "another", existing: toView(rest[0]) };
  return { action: "allow", acknowledgedId: acknowledged.id };
}

function toView(candidate: LedgerDuplicateCandidate): LedgerDuplicateView {
  return {
    id: candidate.id,
    status: candidate.status,
    description: candidate.description,
    entryDate: candidate.entryDate,
    amountCents: candidate.amountCents,
  };
}

export function ledgerDuplicateMessage(reason: "new" | "another" | "stale" | "confirmed"): string {
  if (reason === "confirmed") return "Este lançamento repete um documento ou envio já registrado.";
  if (reason === "another") return "Ainda há outro lançamento parecido. Revise este também antes de gravar.";
  if (reason === "stale") return "O lançamento indicado não corresponde mais a este envio. Revise a duplicidade de novo.";
  return "Há um lançamento parecido nesta data, valor e conta. Revise antes de gravar outro.";
}
