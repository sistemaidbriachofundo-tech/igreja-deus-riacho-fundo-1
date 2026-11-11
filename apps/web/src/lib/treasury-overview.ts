import { formatBRL } from "./das-operations";

export type TreasuryAccount = { id: string; code: string; name: string; type: string };
export type TreasuryEntryLine = { accountId: string; side: "DEBIT" | "CREDIT"; cents: number };
export type TreasuryEntry = {
  id: string;
  entryDate: string;
  description: string;
  status: string;
  amountCents: number | null;
  createdByUserId: string;
  firstApprovedByUserId: string | null;
  costCenterId: string | null;
  reconciliationId: string | null;
  lines: TreasuryEntryLine[];
};

export const treasuryChannels = [
  { id: "pix", name: "Pix", revenue: "4.2.10.01" },
  { id: "cartao", name: "Cartão", revenue: "4.2.10.02", pending: "1.2.20.01" },
  { id: "dinheiro", name: "Dinheiro", revenue: "4.2.10.03", pending: "1.2.20.02" },
] as const;

export type TreasuryChannel = typeof treasuryChannels[number]["id"] | "outras";
const channelByRevenue = new Map<string, TreasuryChannel>(treasuryChannels.map(item => [item.revenue, item.id]));
const channelByPending = new Map<string, TreasuryChannel>(
  treasuryChannels.flatMap(item => "pending" in item ? [[item.pending, item.id] as const] : []),
);

export function ledgerChannel(entry: TreasuryEntry, accounts: ReadonlyMap<string, TreasuryAccount>): TreasuryChannel | "movimentacao" {
  for (const line of entry.lines) {
    const account = accounts.get(line.accountId);
    if (!account) continue;
    const channel = channelByRevenue.get(account.code) ?? channelByPending.get(account.code);
    if (channel) return channel;
  }
  return entry.lines.some(line => accounts.get(line.accountId)?.type === "REVENUE") ? "outras" : "movimentacao";
}

export function summarizeTreasury(
  accounts: TreasuryAccount[],
  entries: TreasuryEntry[],
  countedEntryIds: readonly string[],
  dates: { from: string; to: string },
) {
  const counted = new Set(countedEntryIds);
  const accountById = new Map(accounts.map(account => [account.id, account]));
  const balances = new Map<string, number>();
  const recognized: Record<TreasuryChannel, number> = { pix: 0, cartao: 0, dinheiro: 0, outras: 0 };
  const reconciled: Record<"cartao" | "dinheiro", number> = { cartao: 0, dinheiro: 0 };
  let cardFees = 0;
  const byDay = new Map<string, number>();
  for (const entry of entries) {
    if (!counted.has(entry.id)) continue;
    const inPeriod = (!dates.from || entry.entryDate >= dates.from) && (!dates.to || entry.entryDate <= dates.to);
    const bankMovement = entry.lines.reduce((sum, line) => {
      const account = accountById.get(line.accountId);
      return account?.type === "ASSET" && /^1\.1(\.|$)/.test(account.code)
        ? sum + (line.side === "DEBIT" ? line.cents : -line.cents) : sum;
    }, 0);
    const settlement = entry.lines.find(line => {
      const id = channelByPending.get(accountById.get(line.accountId)?.code ?? "");
      return (id === "cartao" || id === "dinheiro") && (bankMovement > 0 ? line.side === "CREDIT" : line.side === "DEBIT");
    });
    const settledChannel = settlement ? channelByPending.get(accountById.get(settlement.accountId)?.code ?? "") : null;
    if (inPeriod && bankMovement !== 0 && (settledChannel === "cartao" || settledChannel === "dinheiro")) {
      reconciled[settledChannel] += bankMovement;
    }
    for (const line of entry.lines) {
      const account = accountById.get(line.accountId);
      if (!account) continue;
      const signed = line.side === "DEBIT" ? line.cents : -line.cents;
      balances.set(account.id, (balances.get(account.id) ?? 0) + signed);
      if (inPeriod && account.type === "REVENUE") {
        const channel = channelByRevenue.get(account.code) ?? "outras";
        recognized[channel] -= signed;
        byDay.set(entry.entryDate, (byDay.get(entry.entryDate) ?? 0) - signed);
      }
      if (inPeriod && settledChannel === "cartao" && account.type === "EXPENSE" && /^5\.9(\.|$)/.test(account.code)) {
        cardFees += signed;
      }
    }
  }
  const banks = accounts.filter(account => account.type === "ASSET" && /^1\.1(\.|$)/.test(account.code))
    .map(account => ({ ...account, balance: balances.get(account.id) ?? 0 }))
    .filter(account => /^1\.1\.10\./.test(account.code) || account.balance !== 0);
  const pending = {
    cartao: accounts.filter(account => account.code === "1.2.20.01").reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0),
    dinheiro: accounts.filter(account => account.code === "1.2.20.02").reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0),
  };
  return {
    banks,
    recognized,
    reconciled,
    cardFees,
    pending,
    accountById,
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)),
  };
}

export function compactMoney(cents: number) {
  return Math.abs(cents) >= 100_000
    ? new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(cents / 100)
    : formatBRL(cents).replace(/^R\$\s*/, "");
}
