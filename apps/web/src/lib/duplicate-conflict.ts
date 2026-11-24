import { ApiRequestError } from "./api";

export type DuplicateConflict =
  | { code: "EVENT_REGISTRATION_DUPLICATE"; existing: { id: string; status: string } }
  | { code: "LEDGER_POSSIBLE_DUPLICATE" | "LEDGER_DUPLICATE_CONFIRMED"; existing: {
      id: string; status: string; description: string; entryDate: string; amountCents: number;
    } };

/** Only recognize explicit, scoped server conflicts; never infer duplicates from arbitrary 409 messages. */
export function readDuplicateConflict(error: unknown): DuplicateConflict | null {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return null;
  try {
    const payload = JSON.parse(error.message) as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object") return null;
    const row = payload.existing as Record<string, unknown> | undefined;
    if (!row || typeof row.id !== "string" || !row.id || typeof row.status !== "string") return null;
    if (payload.code === "EVENT_REGISTRATION_DUPLICATE") return {
      code: payload.code, existing: { id: row.id, status: row.status },
    };
    if ((payload.code === "LEDGER_POSSIBLE_DUPLICATE" || payload.code === "LEDGER_DUPLICATE_CONFIRMED")
      && typeof row.description === "string" && typeof row.entryDate === "string"
      && typeof row.amountCents === "number" && Number.isSafeInteger(row.amountCents) && row.amountCents > 0) return {
      code: payload.code, existing: { id: row.id, status: row.status,
        description: row.description, entryDate: row.entryDate, amountCents: row.amountCents },
    };
  } catch { /* Non-JSON and unknown conflicts retain the standard error flow. */ }
  return null;
}
