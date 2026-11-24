import {
  ACKNOWLEDGE_FIELD,
  PREVENTIVE_CODES,
  PREVENTIVE_COPY,
  type PreventiveCode,
  type PreventiveExisting,
} from "@idbrf/shared";
import { ApiRequestError } from "./api";

const CODES = new Set<string>(PREVENTIVE_CODES);

export type PreventiveConflict = {
  code: PreventiveCode;
  title: string;
  message: string;
  action: string;
  cancel: string;
  existing?: PreventiveExisting;
  blocking: boolean;
  acknowledgeField?: string;
  ledger?: { description: string; entryDate: string; amountCents: number };
};

/** Lê só o contrato 409. Ignora 403, texto solto e campos que não sejam id e situação. */
export function readPreventiveConflict(error: unknown): PreventiveConflict | null {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return null;
  try {
    const payload = JSON.parse(error.message) as Record<string, unknown> | null;
    if (!payload || typeof payload.code !== "string" || !CODES.has(payload.code)) return null;
    const code = payload.code as PreventiveCode;
    const copy = PREVENTIVE_COPY[code];
    const row = payload.existing;
    let existing: PreventiveExisting | undefined;
    let ledger: PreventiveConflict["ledger"];
    if (row && typeof row === "object") {
      const item = row as Record<string, unknown>;
      if (typeof item.id === "string" && item.id && typeof item.status === "string" && item.status) {
        existing = { id: item.id, status: item.status };
        if (code === "LEDGER_POSSIBLE_DUPLICATE"
          && typeof item.description === "string"
          && typeof item.entryDate === "string"
          && typeof item.amountCents === "number"
          && Number.isSafeInteger(item.amountCents)) {
          ledger = { description: item.description, entryDate: item.entryDate, amountCents: item.amountCents };
        }
      }
    }
    const blocking = payload.blocking === true;
    return {
      code,
      ...copy,
      existing,
      blocking,
      acknowledgeField: blocking ? undefined : ACKNOWLEDGE_FIELD[code],
      ledger,
    };
  } catch {
    return null;
  }
}
