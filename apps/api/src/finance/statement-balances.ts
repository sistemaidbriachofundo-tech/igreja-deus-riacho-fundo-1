export interface BalanceLine {
  side: string;
  amountCents: number;
  accountId: string;
  account: { id: string; code: string; name: string; type: string };
  entry: { costCenterId: string | null };
}

export interface BankBalance {
  accountId: string;
  code: string;
  name: string;
  balanceCents: number;
  centers: Array<{ costCenterId: string | null; balanceCents: number }>;
}

function signedCash(side: string, amountCents: number) {
  return side === "DEBIT" ? amountCents : -amountCents;
}

function isCash(account: { type: string; code: string }) {
  return account.type === "ASSET" && /^1\.1(\.|$)/.test(account.code);
}

function isPayable(account: { type: string; code: string }) {
  return account.type === "LIABILITY" && /^2\.1(\.|$)/.test(account.code);
}

/** Saldos de caixa/banco aprovados, separados por centro de custo. Estornos entram invertidos e se anulam. */
export function projectBankBalances(lines: readonly BalanceLine[]) {
  const banks = new Map<string, BankBalance>();
  const centers = new Map<string, Map<string, number>>();
  let openPayablesCents = 0;
  for (const line of lines) {
    if (isCash(line.account)) {
      const amount = signedCash(line.side, line.amountCents);
      const bank = banks.get(line.accountId) ?? {
        accountId: line.accountId,
        code: line.account.code,
        name: line.account.name,
        balanceCents: 0,
        centers: [],
      };
      bank.balanceCents += amount;
      banks.set(line.accountId, bank);
      const key = line.entry.costCenterId ?? "";
      const byCenter = centers.get(line.accountId) ?? new Map<string, number>();
      byCenter.set(key, (byCenter.get(key) ?? 0) + amount);
      centers.set(line.accountId, byCenter);
    }
    if (isPayable(line.account)) {
      openPayablesCents += line.side === "CREDIT" ? line.amountCents : -line.amountCents;
    }
  }
  return {
    liveBankApis: false as const,
    banks: [...banks.values()].map(bank => ({
      ...bank,
      centers: [...(centers.get(bank.accountId) ?? [])].map(([key, balanceCents]) => ({
        costCenterId: key || null,
        balanceCents,
      })),
    })),
    openPayablesCents,
  };
}
