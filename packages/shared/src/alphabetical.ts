const nameCollator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function sortByName<T>(rows: readonly T[], getName: (row: T) => string | null | undefined): T[] {
  return rows.map(row => ({ row, name: getName(row)?.trim() || "" }))
    .sort((a, b) => Number(!a.name) - Number(!b.name) || nameCollator.compare(a.name, b.name))
    .map(({ row }) => row);
}
