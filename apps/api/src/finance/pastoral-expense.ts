import type { Prisma } from "@prisma/client";

export const pastoralExpenseLines = {
  some: { side: "DEBIT", account: { type: "EXPENSE", NOT: [
    { code: "5.9" }, { code: { startsWith: "5.9." } },
  ] } },
} satisfies Prisma.LedgerEntryLineListRelationFilter;
