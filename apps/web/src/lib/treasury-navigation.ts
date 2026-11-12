/** Seções de Tesouraria — âncoras funcionam também no GitHub Pages estático. */
export type TreasurySection = "visao" | "despesas" | "extrato" | "conciliacao" | "aprovacoes" | "lancar";

export type TreasurySidebarItem = {
  section: TreasurySection;
  label: string;
  icon: "grid" | "wallet" | "book" | "check" | "shield" | "plus";
};

const SECTIONS: readonly TreasurySidebarItem[] = [
  { section: "visao", label: "Visão geral", icon: "grid" },
  { section: "despesas", label: "Despesas", icon: "wallet" },
  { section: "lancar", label: "Incluir despesa", icon: "plus" },
  { section: "extrato", label: "Extrato", icon: "book" },
  { section: "conciliacao", label: "Conciliações", icon: "check" },
  { section: "aprovacoes", label: "Aprovações", icon: "shield" },
];

/**
 * Este catálogo apenas controla a navegação; a API autoriza operações.
 * Pastor sem Tesouraria vê só suas aprovações, sem acesso ao extrato.
 * Administrador pode cadastrar uma despesa pendente, mas nunca autoriza pagamentos.
 */
export function treasurySidebarItems(roles: readonly string[]): readonly TreasurySidebarItem[] {
  const treasurer = roles.includes("TESOURARIA");
  const pastor = roles.includes("PASTOR");
  const admin = roles.includes("PLATFORM_ADMIN");
  if (!treasurer && !pastor && !admin) return [];
  if (pastor && !treasurer && !admin) return SECTIONS.filter(item => item.section === "aprovacoes");
  return SECTIONS.filter(item =>
    (item.section !== "lancar" || treasurer || admin) &&
    (item.section !== "aprovacoes" || treasurer || pastor),
  );
}

/** Tipo do lançamento também fica na âncora, para não transformar Pix em despesa. */
export const TREASURY_MOVEMENT_TYPES = [
  "despesa", "pix", "cartao", "dinheiro", "deposito", "liquidacao", "compromisso", "pagar",
] as const;
export type TreasuryMovement = (typeof TREASURY_MOVEMENT_TYPES)[number];

export function treasuryMovementFromHash(hash: string): TreasuryMovement {
  const raw = hash.replace(/^#/, "");
  const candidate = raw === "lancar" ? "despesa" : raw.startsWith("lancar:") ? raw.slice(7) : "";
  return TREASURY_MOVEMENT_TYPES.find(item => item === candidate) ?? "despesa";
}
export function treasuryMovementHash(movement: TreasuryMovement): string {
  return movement === "despesa" ? "#lancar" : `#lancar:${movement}`;
}

export function treasurySectionFromHash(hash: string, roles: readonly string[]): TreasurySection {
  const items = treasurySidebarItems(roles);
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const section = raw.startsWith("lancar:") && TREASURY_MOVEMENT_TYPES.some(type => raw === `lancar:${type}`) ? "lancar" : raw;
  const found = items.find(item => item.section === section);
  return found?.section ?? (roles.includes("PASTOR") && !roles.includes("TESOURARIA") && !roles.includes("PLATFORM_ADMIN") ? "aprovacoes" : "visao");
}

export function treasurySectionHref(section: TreasurySection): string {
  return `/app/tesouraria/#${section}`;
}
