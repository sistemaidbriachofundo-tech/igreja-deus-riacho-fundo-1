/** Resumo seguro para cartões: evita que nomes longos ou massa sintética quebrem o grid. */
export function ministryLeaderSummary(names: readonly string[], limit = 2): { visible: string; remaining: number; full: string } {
  const unique = [...new Set(names.map(name => name.trim()).filter(Boolean))];
  const displayed = unique.slice(0, Math.max(0, limit));
  return { visible: displayed.join(", "), remaining: Math.max(0, unique.length - displayed.length), full: unique.join(", ") };
}
