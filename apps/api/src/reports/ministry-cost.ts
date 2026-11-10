/**
 * Custo ministerial sem coluna nova.
 * Um centro de custo pertence ao ministério quando `cost_centers.code`
 * é igual a `ministries.slug`. Sem esse vínculo o valor fica nulo —
 * não vira zero e não herda o caixa da igreja.
 * Entram só lançamentos APPROVED. Despesa 5.9 (taxa) fica de fora.
 * O estorno aprovado entra com o sinal invertido; o original REVERSED não entra.
 */

export interface MinistryCostMinistry {
  id: string;
  name: string;
  slug: string;
}

export interface MinistryCostCenter {
  id: string;
  code: string;
}

export interface MinistryCostLine {
  side: "DEBIT" | "CREDIT";
  amountCents: number;
  accountType: string;
  accountCode: string;
}

export interface MinistryCostEntry {
  status: string;
  costCenterId: string | null;
  entryDate: Date;
  lines: MinistryCostLine[];
}

export interface MinistryCostRow {
  ministryId: string;
  name: string;
  slug: string;
  costCenterIds: string[];
  costCenterCodes: string[];
  attributed: boolean;
  expenseCents: number | null;
  approvedEntries: number | null;
  note: string;
}

const NOTE_UNLINKED =
  "Nenhum centro de custo usa o identificador deste ministério. O custo não foi calculado.";
const NOTE_LINKED =
  "Despesa líquida aprovada no centro de custo do ministério. Taxa 5.9 e rascunho ficam de fora.";

export function attributeMinistryCost(input: {
  ministries: MinistryCostMinistry[];
  costCenters: MinistryCostCenter[];
  entries: MinistryCostEntry[];
  from?: Date;
  to?: Date;
}): {
  rows: MinistryCostRow[];
  series: Array<{ label: string; expenseCents: number }>;
  seriesMatch: boolean;
} {
  const centersBySlug = new Map<string, MinistryCostCenter[]>();
  for (const center of input.costCenters) {
    const key = center.code.trim().toLowerCase();
    const list = centersBySlug.get(key) ?? [];
    list.push(center);
    centersBySlug.set(key, list);
  }

  const rows = input.ministries.map((ministry) => {
    const centers = centersBySlug.get(ministry.slug.trim().toLowerCase()) ?? [];
    if (centers.length === 0) {
      return {
        ministryId: ministry.id,
        name: ministry.name,
        slug: ministry.slug,
        costCenterIds: [] as string[],
        costCenterCodes: [] as string[],
        attributed: false,
        expenseCents: null,
        approvedEntries: null,
        note: NOTE_UNLINKED,
      };
    }
    const ids = new Set(centers.map((center) => center.id));
    let expenseCents = 0;
    let approvedEntries = 0;
    for (const entry of input.entries) {
      if (entry.status !== "APPROVED") continue;
      if (!entry.costCenterId || !ids.has(entry.costCenterId)) continue;
      if (input.from && entry.entryDate.getTime() < input.from.getTime()) continue;
      if (input.to && entry.entryDate.getTime() > input.to.getTime()) continue;
      approvedEntries += 1;
      for (const line of entry.lines) {
        if (line.accountType !== "EXPENSE") continue;
        if (/^5\.9(\.|$)/.test(line.accountCode.trim())) continue;
        if (!Number.isInteger(line.amountCents)) {
          throw new Error("MINISTRY_COST_LINE_INVALID");
        }
        expenseCents += line.side === "DEBIT" ? line.amountCents : -line.amountCents;
      }
    }
    return {
      ministryId: ministry.id,
      name: ministry.name,
      slug: ministry.slug,
      costCenterIds: centers.map((center) => center.id),
      costCenterCodes: centers.map((center) => center.code),
      attributed: true,
      expenseCents,
      approvedEntries,
      note: NOTE_LINKED,
    };
  });

  const series = rows.flatMap((row) =>
    row.attributed && row.expenseCents !== null
      ? [{ label: row.name, expenseCents: row.expenseCents }]
      : [],
  );
  const rowSum = rows.reduce(
    (total, row) => total + (row.attributed && row.expenseCents !== null ? row.expenseCents : 0),
    0,
  );
  const seriesSum = series.reduce((total, item) => total + item.expenseCents, 0);
  const attributed = rows.filter((row) => row.attributed).length;
  return {
    rows,
    series,
    seriesMatch: seriesSum === rowSum && series.length === attributed,
  };
}
