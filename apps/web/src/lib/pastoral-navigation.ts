export const PASTORAL_SECTIONS = [
  { id: "admissoes", title: "Admissões", icon: "layers", href: "/app/pastoral/admissoes/" },
  { id: "despesas", title: "Despesas", icon: "wallet", href: "/app/pastoral/despesas/" },
  { id: "cuidado", title: "Cuidado pastoral", icon: "family", href: "/app/pastoral/cuidado/" },
  { id: "ordem-de-culto", title: "Ordem de Culto", icon: "book", href: "/app/pastoral/ordem-de-culto/" },
  { id: "aniversariantes", title: "Aniversariantes", icon: "birthday", href: "/app/pastoral/aniversariantes/" },
] as const;

export type PastoralSection = (typeof PASTORAL_SECTIONS)[number]["id"];

export function pastoralSections(roles: readonly string[]) {
  return PASTORAL_SECTIONS.filter(item => item.id !== "cuidado" || roles.includes("PASTOR"));
}
