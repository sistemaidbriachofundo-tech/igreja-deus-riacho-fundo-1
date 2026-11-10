/** Barras só com números já agregados. Série incompleta não vira zero. */

export type Bar = { label: string; value: number };

export function barsFromCounts(record: Record<string, number> | null | undefined): Bar[] | null {
  if (!record) return null;
  const entries = Object.entries(record);
  if (entries.length === 0) return [];
  if (entries.some(([, value]) => typeof value !== "number" || !Number.isFinite(value))) return null;
  return entries.map(([label, value]) => ({ label, value }));
}

const PARTICIPATION_PARTS = [
  "cancelled",
  "checkedIn",
  "pendingPayment",
  "confirmedAwaitingPresence",
  "unclassified",
] as const;

export function participationBars(counts: Record<string, number> | null | undefined): Bar[] | null {
  if (!counts) return null;
  if (typeof counts.registrations !== "number" || !Number.isFinite(counts.registrations)) return null;
  if (PARTICIPATION_PARTS.some((key) => typeof counts[key] !== "number" || !Number.isFinite(counts[key]))) {
    return null;
  }
  const sum = PARTICIPATION_PARTS.reduce((total, key) => total + counts[key], 0);
  if (sum !== counts.registrations) return null;
  return PARTICIPATION_PARTS.map((key) => ({ label: key, value: counts[key] }));
}

export function costBars(
  series: Array<{ label: string; expenseCents: number }> | null | undefined,
  seriesMatch: boolean,
): Bar[] | null {
  if (!seriesMatch || !series || series.length === 0) return null;
  if (series.some((item) => typeof item.label !== "string" || typeof item.expenseCents !== "number" || !Number.isFinite(item.expenseCents))) {
    return null;
  }
  return series.map((item) => ({ label: item.label, value: item.expenseCents }));
}
