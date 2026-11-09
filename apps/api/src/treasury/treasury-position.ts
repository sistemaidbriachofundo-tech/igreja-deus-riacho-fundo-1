/**
 * Posição de tesouraria sobre o ledger já existente (RF-016).
 * Não cria coluna, enum nem tabela. Papel de liquidez sai do tipo + código.
 *
 * Convenção compatível com o plano de contas sintético já usado nos testes:
 * - ASSET 1.1*  caixa / banco liquidado
 * - ASSET 1.2*  contas a receber
 * - LIABILITY 2.1*  contas a pagar (despesa comprometida)
 * - REVENUE     receita reconhecida (bruta)
 * - EXPENSE 5.9* taxa (não é despesa operacional)
 * - EXPENSE demais  despesa operacional
 * Qualquer outro código fica de fora dos quatro saldos e entra em
 * `unclassifiedCents`, para não ser silenciosamente somado ao caixa.
 */

export const TREASURY_BLOCKED = {
  rbacPr101Integrated: false,
  uniqueIdempotencyKey: "BLOCKED",
  liquidityRoleColumn: "BLOCKED",
  grossFeeColumns: "BLOCKED",
  endpointCatalog: "BLOCKED",
  liveBankApis: false,
  pix: "BLOCKED",
  cardAcquirer: "BLOCKED",
} as const;

export type AccountLiquidityRole =
  | "CASH"
  | "RECEIVABLE"
  | "PAYABLE"
  | "REVENUE"
  | "FEE"
  | "EXPENSE"
  | "UNCLASSIFIED";

export type TreasuryPostingKind =
  | "CASH_RECEIPT"
  | "RECEIVABLE"
  | "COMMITMENT"
  | "SETTLEMENT";

export interface TreasuryLine {
  accountId: string;
  side: "DEBIT" | "CREDIT";
  amountCents: number;
  memo: string;
}

export interface PositionLine {
  side: "DEBIT" | "CREDIT";
  amountCents: number;
  accountType: string;
  accountCode: string;
}

export interface PositionEntry {
  id: string;
  status: string;
  costCenterId?: string | null;
  lines: PositionLine[];
}

export interface CostCenterSlice {
  costCenterId: string | null;
  receivedRevenueCents: number;
  receivableOpenCents: number;
  settledCashCents: number;
  committedExpenseCents: number;
  availableCents: number;
  grossRevenueCents: number;
  feeCents: number;
  netRevenueCents: number;
}

export interface TreasuryPosition {
  receivedRevenueCents: number;
  receivableOpenCents: number;
  settledCashCents: number;
  committedExpenseCents: number;
  /** Despesa e taxa já saídas do caixa. Não entra de novo em `availableCents`. */
  settledCostCents: number;
  availableCents: number;
  grossRevenueCents: number;
  feeCents: number;
  netRevenueCents: number;
  unclassifiedCents: number;
  countedEntryIds: string[];
  excluded: Record<string, number>;
  byCostCenter: CostCenterSlice[];
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9:._-]{8,80}$/;

export function assertIdempotencyKey(value: string): string {
  const key = value?.trim() ?? "";
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  return key;
}

export function classifyAccount(
  accountType: string,
  accountCode: string,
): AccountLiquidityRole {
  const code = accountCode?.trim() ?? "";
  if (accountType === "ASSET" && /^1\.1(\.|$)/.test(code)) return "CASH";
  if (accountType === "ASSET" && /^1\.2(\.|$)/.test(code)) return "RECEIVABLE";
  if (accountType === "LIABILITY" && /^2\.1(\.|$)/.test(code)) return "PAYABLE";
  if (accountType === "REVENUE") return "REVENUE";
  if (accountType === "EXPENSE" && /^5\.9(\.|$)/.test(code)) return "FEE";
  if (accountType === "EXPENSE") return "EXPENSE";
  return "UNCLASSIFIED";
}

function add(left: number, right: number): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw new Error("AMOUNT_OVERFLOW");
  }
  return sum;
}

function assertAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("INVALID_AMOUNT");
  }
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error("AMOUNT_OVERFLOW");
  }
}

function line(
  accountId: string,
  side: "DEBIT" | "CREDIT",
  amountCents: number,
  memo: string,
): TreasuryLine {
  const id = accountId?.trim() ?? "";
  if (!id) throw new Error("MISSING_ACCOUNT");
  assertAmount(amountCents);
  return { accountId: id, side, amountCents, memo };
}

export function buildCashReceiptLines(input: {
  cashAccountId: string;
  revenueAccountId: string;
  grossCents: number;
  feeCents?: number;
  feeAccountId?: string;
}): TreasuryLine[] {
  assertAmount(input.grossCents);
  const fee = input.feeCents ?? 0;
  if (!Number.isInteger(fee) || fee < 0) throw new Error("INVALID_AMOUNT");
  if (fee >= input.grossCents) throw new Error("FEE_EXCEEDS_GROSS");
  if (fee === 0 && input.feeAccountId) throw new Error("FEE_ACCOUNT_UNEXPECTED");
  if (fee > 0 && !input.feeAccountId?.trim()) throw new Error("MISSING_FEE_ACCOUNT");
  const cashId = input.cashAccountId?.trim() ?? "";
  const revenueId = input.revenueAccountId?.trim() ?? "";
  if (!cashId || !revenueId || cashId === revenueId) {
    throw new Error("ACCOUNTS_NOT_DISTINCT");
  }
  if (fee > 0 && (input.feeAccountId?.trim() === cashId || input.feeAccountId?.trim() === revenueId)) {
    throw new Error("ACCOUNTS_NOT_DISTINCT");
  }
  const net = input.grossCents - fee;
  const lines = [
    line(cashId, "DEBIT", net, "treasury:cash"),
    line(revenueId, "CREDIT", input.grossCents, "treasury:gross"),
  ];
  if (fee > 0) {
    lines.splice(1, 0, line(input.feeAccountId!.trim(), "DEBIT", fee, "treasury:fee"));
  }
  return lines;
}

export function buildReceivableLines(input: {
  receivableAccountId: string;
  revenueAccountId: string;
  grossCents: number;
}): TreasuryLine[] {
  assertAmount(input.grossCents);
  const receivableId = input.receivableAccountId?.trim() ?? "";
  const revenueId = input.revenueAccountId?.trim() ?? "";
  if (!receivableId || !revenueId || receivableId === revenueId) {
    throw new Error("ACCOUNTS_NOT_DISTINCT");
  }
  return [
    line(receivableId, "DEBIT", input.grossCents, "treasury:receivable"),
    line(revenueId, "CREDIT", input.grossCents, "treasury:gross"),
  ];
}

export function buildCommitmentLines(input: {
  expenseAccountId: string;
  payableAccountId: string;
  amountCents: number;
}): TreasuryLine[] {
  assertAmount(input.amountCents);
  const expenseId = input.expenseAccountId?.trim() ?? "";
  const payableId = input.payableAccountId?.trim() ?? "";
  if (!expenseId || !payableId || expenseId === payableId) {
    throw new Error("ACCOUNTS_NOT_DISTINCT");
  }
  return [
    line(expenseId, "DEBIT", input.amountCents, "treasury:expense"),
    line(payableId, "CREDIT", input.amountCents, "treasury:payable"),
  ];
}

export function buildSettlementLines(input: {
  payableAccountId: string;
  cashAccountId: string;
  amountCents: number;
}): TreasuryLine[] {
  assertAmount(input.amountCents);
  const payableId = input.payableAccountId?.trim() ?? "";
  const cashId = input.cashAccountId?.trim() ?? "";
  if (!payableId || !cashId || payableId === cashId) {
    throw new Error("ACCOUNTS_NOT_DISTINCT");
  }
  return [
    line(payableId, "DEBIT", input.amountCents, "treasury:settle-payable"),
    line(cashId, "CREDIT", input.amountCents, "treasury:cash"),
  ];
}

interface Bucket {
  receivedRevenueCents: number;
  receivableOpenCents: number;
  settledCashCents: number;
  committedExpenseCents: number;
  expenseNetCents: number;
  grossRevenueCents: number;
  feeCents: number;
  unclassifiedCents: number;
  countedEntryIds: string[];
}

function emptyBucket(): Bucket {
  return {
    receivedRevenueCents: 0,
    receivableOpenCents: 0,
    settledCashCents: 0,
    committedExpenseCents: 0,
    expenseNetCents: 0,
    grossRevenueCents: 0,
    feeCents: 0,
    unclassifiedCents: 0,
    countedEntryIds: [],
  };
}

function applyEntry(bucket: Bucket, entry: PositionEntry): void {
  let cashDebit = 0;
  let cashCredit = 0;
  let arDebit = 0;
  let arCredit = 0;
  let apDebit = 0;
  let apCredit = 0;
  let revDebit = 0;
  let revCredit = 0;
  let expDebit = 0;
  let expCredit = 0;
  let feeDebit = 0;
  let feeCredit = 0;

  for (const item of entry.lines) {
    if (item.side !== "DEBIT" && item.side !== "CREDIT") {
      throw new Error("INVALID_SIDE");
    }
    assertAmount(item.amountCents);
    const role = classifyAccount(item.accountType, item.accountCode);
    const debit = item.side === "DEBIT";
    if (role === "UNCLASSIFIED") {
      bucket.unclassifiedCents = add(bucket.unclassifiedCents, item.amountCents);
      continue;
    }
    if (role === "CASH") {
      if (debit) cashDebit = add(cashDebit, item.amountCents);
      else cashCredit = add(cashCredit, item.amountCents);
    } else if (role === "RECEIVABLE") {
      if (debit) arDebit = add(arDebit, item.amountCents);
      else arCredit = add(arCredit, item.amountCents);
    } else if (role === "PAYABLE") {
      if (debit) apDebit = add(apDebit, item.amountCents);
      else apCredit = add(apCredit, item.amountCents);
    } else if (role === "REVENUE") {
      if (debit) revDebit = add(revDebit, item.amountCents);
      else revCredit = add(revCredit, item.amountCents);
    } else if (role === "EXPENSE") {
      if (debit) expDebit = add(expDebit, item.amountCents);
      else expCredit = add(expCredit, item.amountCents);
    } else if (debit) {
      feeDebit = add(feeDebit, item.amountCents);
    } else {
      feeCredit = add(feeCredit, item.amountCents);
    }
  }

  const inflow = Math.min(cashDebit, add(revCredit, arCredit));
  const outflow = Math.min(cashCredit, add(revDebit, arDebit));
  bucket.receivedRevenueCents = add(bucket.receivedRevenueCents, inflow - outflow);
  bucket.receivableOpenCents = add(bucket.receivableOpenCents, arDebit - arCredit);
  bucket.settledCashCents = add(bucket.settledCashCents, cashDebit - cashCredit);
  bucket.committedExpenseCents = add(bucket.committedExpenseCents, apCredit - apDebit);
  bucket.grossRevenueCents = add(bucket.grossRevenueCents, revCredit - revDebit);
  bucket.feeCents = add(bucket.feeCents, feeDebit - feeCredit);
  bucket.expenseNetCents = add(bucket.expenseNetCents, expDebit - expCredit);
  bucket.countedEntryIds.push(entry.id);
}

function finish(bucket: Bucket, excluded: Record<string, number>, slices: CostCenterSlice[]): TreasuryPosition {
  const netRevenueCents = bucket.grossRevenueCents - bucket.feeCents;
  if (!Number.isSafeInteger(netRevenueCents)) throw new Error("AMOUNT_OVERFLOW");
  const settledCostCents =
    bucket.expenseNetCents + bucket.feeCents - bucket.committedExpenseCents;
  if (!Number.isSafeInteger(settledCostCents)) throw new Error("AMOUNT_OVERFLOW");
  const availableCents = bucket.settledCashCents - bucket.committedExpenseCents;
  if (!Number.isSafeInteger(availableCents)) throw new Error("AMOUNT_OVERFLOW");
  return {
    receivedRevenueCents: bucket.receivedRevenueCents,
    receivableOpenCents: bucket.receivableOpenCents,
    settledCashCents: bucket.settledCashCents,
    committedExpenseCents: bucket.committedExpenseCents,
    settledCostCents,
    availableCents,
    grossRevenueCents: bucket.grossRevenueCents,
    feeCents: bucket.feeCents,
    netRevenueCents,
    unclassifiedCents: bucket.unclassifiedCents,
    countedEntryIds: bucket.countedEntryIds,
    excluded,
    byCostCenter: slices,
  };
}

function sliceOf(costCenterId: string | null, entries: PositionEntry[]): CostCenterSlice {
  const bucket = emptyBucket();
  for (const entry of entries) applyEntry(bucket, entry);
  const position = finish(bucket, {}, []);
  return {
    costCenterId,
    receivedRevenueCents: position.receivedRevenueCents,
    receivableOpenCents: position.receivableOpenCents,
    settledCashCents: position.settledCashCents,
    committedExpenseCents: position.committedExpenseCents,
    availableCents: position.availableCents,
    grossRevenueCents: position.grossRevenueCents,
    feeCents: position.feeCents,
    netRevenueCents: position.netRevenueCents,
  };
}

/**
 * Entram APPROVED e REVERSED. O estorno do ledger nasce APPROVED com lados
 * invertidos e o original passa a REVERSED: os dois juntos zeram. Descartar o
 * original e manter só o estorno inverteria o saldo.
 * DRAFT, PENDING_APPROVAL e REJECTED ficam de fora.
 *
 * `availableCents` = caixa liquidado − contas a pagar em aberto.
 * Despesa já paga só reduz o caixa uma vez.
 */
export function projectTreasuryPosition(
  entries: PositionEntry[],
  options?: { costCenterId?: string },
): TreasuryPosition {
  const filter = options?.costCenterId?.trim() || undefined;
  const excluded: Record<string, number> = {};
  const approved: PositionEntry[] = [];

  for (const entry of entries) {
    if (filter && (entry.costCenterId ?? "") !== filter) {
      excluded.OTHER_COST_CENTER = (excluded.OTHER_COST_CENTER ?? 0) + 1;
      continue;
    }
    if (entry.status !== "APPROVED" && entry.status !== "REVERSED") {
      excluded[entry.status || "UNKNOWN"] = (excluded[entry.status || "UNKNOWN"] ?? 0) + 1;
      continue;
    }
    approved.push(entry);
  }

  const bucket = emptyBucket();
  for (const entry of approved) applyEntry(bucket, entry);

  const groups = new Map<string, PositionEntry[]>();
  for (const entry of approved) {
    const key = entry.costCenterId ?? "";
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  const slices = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => sliceOf(key || null, list));

  return finish(bucket, excluded, slices);
}
