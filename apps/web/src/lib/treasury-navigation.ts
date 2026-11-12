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
 * Administrador sem Tesouraria tem consulta, não pode criar/autorizar despesas.
 */
export function treasurySidebarItems(roles: readonly string[]): readonly TreasurySidebarItem[] {
  const treasurer = roles.includes("TESOURARIA");
  const pastor = roles.includes("PASTOR");
  const admin = roles.includes("PLATFORM_ADMIN");
  if (!treasurer && !pastor && !admin) return [];
  if (pastor && !treasurer) return SECTIONS.filter(item => item.section === "aprovacoes");
  return SECTIONS.filter(item =>
    (item.section !== "lancar" || treasurer) &&
    (item.section !== "aprovacoes" || treasurer || pastor),
  );
}

export function treasurySectionFromHash(hash: string, roles: readonly string[]): TreasurySection {
  const items = treasurySidebarItems(roles);
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const found = items.find(item => item.section === raw);
  return found?.section ?? (roles.includes("PASTOR") && !roles.includes("TESOURARIA") ? "aprovacoes" : "visao");
}

export function treasurySectionHref(section: TreasurySection): string {
  return `/app/tesouraria/#${section}`;
}
