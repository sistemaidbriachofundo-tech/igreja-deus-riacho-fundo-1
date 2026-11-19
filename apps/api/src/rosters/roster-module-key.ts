const ACCENTS = "ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ";
const PLAIN = "AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn";

const ALIASES: Record<string, string> = {
  "santa ceia": "ceia",
  diaconia: "ceia",
  "diaconia santa ceia": "ceia",
  "diaconos e santa ceia": "ceia",
  "diaconos santa ceia": "ceia",
  "ofertas e maquininhas": "conexao",
  "ofertas e maquininha": "conexao",
};

export const CANONICAL_MODULE_NAMES: Record<string, string> = {
  recepcao: "Recepção",
  "apoio interno": "Apoio Interno",
  conexao: "Conexão",
  ceia: "Santa Ceia",
};

export const ATMOSFERA_MODULES = Object.entries(CANONICAL_MODULE_NAMES).map(([nameKey, name]) => ({ nameKey, name }));

export function foldedModuleName(name: string | null | undefined): string {
  const source = name ?? "";
  let folded = "";
  for (const char of source.normalize("NFC")) {
    const index = ACCENTS.indexOf(char);
    folded += index >= 0 ? PLAIN[index] : char;
  }
  return folded.toLocaleLowerCase("pt-BR").replace(/[/-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function canonicalModuleKey(name: string | null | undefined): string {
  const folded = foldedModuleName(name);
  return ALIASES[folded] ?? folded;
}

export function canonicalModuleName(key: string): string | null {
  return CANONICAL_MODULE_NAMES[key] ?? null;
}

export type ConsolidatableModule = {
  id: string;
  ministryId: string;
  name: string;
  nameKey: string;
  rules: unknown;
  rosterCount: number;
};

export type ModuleConsolidation = {
  ministryId: string;
  keepId: string;
  name: string;
  nameKey: string;
  rules: unknown;
  dropIds: string[];
};

function withoutPositions(rules: unknown): unknown {
  if (!rules || typeof rules !== "object" || Array.isArray(rules) || !("positions" in rules)) return rules;
  const rest = { ...(rules as Record<string, unknown>) };
  delete rest.positions;
  return rest;
}

function rulesForCanonical(nameKey: string, group: readonly ConsolidatableModule[], keep: ConsolidatableModule, richest: ConsolidatableModule): unknown {
  if (nameKey !== "conexao") {
    return rulesScore(keep.rules) >= rulesScore(richest.rules) ? keep.rules : richest.rules;
  }
  const configured = group.find(row => foldedModuleName(row.name) === "conexao" || foldedModuleName(row.nameKey) === "conexao");
  if (configured) return configured.rules;
  return withoutPositions(keep.rules);
}

function rulesScore(rules: unknown): number {
  return rules && typeof rules === "object" && !Array.isArray(rules) ? Object.keys(rules).length : 0;
}

export function planModuleConsolidation(rows: readonly ConsolidatableModule[]): ModuleConsolidation[] {
  const groups = new Map<string, ConsolidatableModule[]>();
  for (const row of rows) {
    const key = `${row.ministryId}:${canonicalModuleKey(row.name) || canonicalModuleKey(row.nameKey)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].flatMap(group => {
    const nameKey = canonicalModuleKey(group[0].name) || canonicalModuleKey(group[0].nameKey);
    const display = canonicalModuleName(nameKey);
    const ranked = [...group].sort((left, right) => {
      const preferred = Number(right.name === display) - Number(left.name === display);
      if (preferred) return preferred;
      if (right.rosterCount !== left.rosterCount) return right.rosterCount - left.rosterCount;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    const [keep, ...drop] = ranked;
    const richest = [...group].sort((left, right) => rulesScore(right.rules) - rulesScore(left.rules) || (left.id < right.id ? -1 : 1))[0];
    const rules = rulesForCanonical(nameKey, group, keep, richest);
    const changed = drop.length > 0 || keep.nameKey !== nameKey || (display !== null && keep.name !== display) || rules !== keep.rules;
    if (!changed) return [];
    return [{
      ministryId: keep.ministryId,
      keepId: keep.id,
      name: display ?? keep.name,
      nameKey,
      rules,
      dropIds: drop.map(row => row.id),
    }];
  });
}
