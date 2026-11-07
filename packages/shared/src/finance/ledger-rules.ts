/** Regras puras do núcleo financeiro F4 (sem I/O). */

export const LEDGER_ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
] as const;

export type LedgerAccountTypeCode = (typeof LEDGER_ACCOUNT_TYPES)[number];

export const LEDGER_ENTRY_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "REVERSED",
] as const;

export type LedgerEntryStatusCode = (typeof LEDGER_ENTRY_STATUSES)[number];

export const LEDGER_LINE_SIDES = ["DEBIT", "CREDIT"] as const;
export type LedgerLineSideCode = (typeof LEDGER_LINE_SIDES)[number];

export const BANK_IMPORT_FORMATS = ["CSV", "OFX", "PDF_META"] as const;
export type BankImportFormatCode = (typeof BANK_IMPORT_FORMATS)[number];

export const BANK_IMPORT_STATUSES = [
  "RECEIVED",
  "PARSED",
  "PARSED_STUB",
  "META_ONLY",
  "FAILED",
] as const;
export type BankImportStatusCode = (typeof BANK_IMPORT_STATUSES)[number];

export const BANK_IMPORT_ADAPTERS = [
  "FILE",
  "MOCK",
  "SICOOB",
  "BRB",
  "CORA",
] as const;
export type BankImportAdapterCode = (typeof BANK_IMPORT_ADAPTERS)[number];

export const RECONCILIATION_STATUSES = [
  "OPEN",
  "PENDING_APPROVAL",
  "APPROVED",
  "CLOSED",
] as const;

export type ReconciliationStatusCode = (typeof RECONCILIATION_STATUSES)[number];

export const BUDGET_STATUSES = ["DRAFT", "ACTIVE", "CLOSED"] as const;
export type BudgetStatusCode = (typeof BUDGET_STATUSES)[number];

export const ACCOUNTING_PERIOD_STATUSES = ["OPEN", "CLOSED"] as const;
export type AccountingPeriodStatusCode =
  (typeof ACCOUNTING_PERIOD_STATUSES)[number];

/** Competência válida: mês 1–12. */
export function isValidCompetence(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2100 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  );
}

export interface LedgerLineInput {
  accountId: string;
  side: string;
  amountCents: number;
  memo?: string | null;
}

export interface BalanceCheckResult {
  ok: boolean;
  debitCents: number;
  creditCents: number;
  amountCents: number;
  reason?: string;
}

/** Partidas dobradas: soma débitos == soma créditos; ≥ 1 de cada lado. */
export function checkBalancedLines(lines: LedgerLineInput[]): BalanceCheckResult {
  if (!lines.length) {
    return {
      ok: false,
      debitCents: 0,
      creditCents: 0,
      amountCents: 0,
      reason: "EMPTY_LINES",
    };
  }

  let debitCents = 0;
  let creditCents = 0;
  let hasDebit = false;
  let hasCredit = false;

  for (const line of lines) {
    if (!LEDGER_LINE_SIDES.includes(line.side as LedgerLineSideCode)) {
      return {
        ok: false,
        debitCents,
        creditCents,
        amountCents: 0,
        reason: "INVALID_SIDE",
      };
    }
    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
      return {
        ok: false,
        debitCents,
        creditCents,
        amountCents: 0,
        reason: "INVALID_AMOUNT",
      };
    }
    if (!line.accountId?.trim()) {
      return {
        ok: false,
        debitCents,
        creditCents,
        amountCents: 0,
        reason: "MISSING_ACCOUNT",
      };
    }
    if (line.side === "DEBIT") {
      debitCents += line.amountCents;
      hasDebit = true;
    } else {
      creditCents += line.amountCents;
      hasCredit = true;
    }
  }

  if (!hasDebit || !hasCredit) {
    return {
      ok: false,
      debitCents,
      creditCents,
      amountCents: debitCents,
      reason: "MISSING_SIDE",
    };
  }

  if (debitCents !== creditCents) {
    return {
      ok: false,
      debitCents,
      creditCents,
      amountCents: debitCents,
      reason: "UNBALANCED",
    };
  }

  return { ok: true, debitCents, creditCents, amountCents: debitCents };
}

/**
 * Dupla aprovação: 1ª ≠ criador; 2ª ≠ 1ª (e ≠ criador).
 * Retorna o estágio após a aprovação deste ator.
 */
export function nextDualApprovalStage(input: {
  actorUserId: string;
  createdByUserId: string;
  firstApprovedByUserId: string | null;
}):
  | { ok: true; stage: "FIRST" | "SECOND" }
  | { ok: false; code: string } {
  if (input.actorUserId === input.createdByUserId) {
    return { ok: false, code: "APPROVER_IS_CREATOR" };
  }
  if (!input.firstApprovedByUserId) {
    return { ok: true, stage: "FIRST" };
  }
  if (input.actorUserId === input.firstApprovedByUserId) {
    return { ok: false, code: "APPROVER_ALREADY_FIRST" };
  }
  return { ok: true, stage: "SECOND" };
}

/** CSV sintético stub: `date,amountCents,description[,externalRef]` (sem header obrigatório). */
export function parseSyntheticCsvLines(
  text: string,
): Array<{
  postedAt: string;
  amountCents: number;
  description: string;
  externalRef: string | null;
}> {
  const rows: Array<{
    postedAt: string;
    amountCents: number;
    description: string;
    externalRef: string | null;
  }> = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.toLowerCase().startsWith("date,")) {
      continue;
    }
    const parts = line.split(",");
    if (parts.length < 3) {
      continue;
    }
    const [dateRaw, amountRaw, ...rest] = parts;
    const amountCents = Number.parseInt(amountRaw.trim(), 10);
    if (!dateRaw.trim() || !Number.isFinite(amountCents)) {
      continue;
    }
    const description = rest[0]?.trim() || "linha sintética";
    const externalRef = rest[1]?.trim() || null;
    rows.push({
      postedAt: dateRaw.trim(),
      amountCents,
      description,
      externalRef,
    });
  }

  return rows;
}
