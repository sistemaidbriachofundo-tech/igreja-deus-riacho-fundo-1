/** Identidade oficial de 2026: arquivo vetorial derivado da arte aprovada, com transparência real. */
export const officialLogoAsset = "/images/idb-riacho-oficial-transparente.svg" as const;

/** Tokens oficiais da identidade visual (docs/identidade-visual.md). */
export const brandColors = {
  laranja: "#FF5700",
  preto: "#000000",
  dourado: "#D4AF37",
  marrom: "#4A2612",
  creme: "#F7EDE0",
  bronze: "#B8742D",
  terracota: "#C6583E",
} as const;

export const brandFonts = {
  title: "Montserrat",
  body: "Inter",
} as const;

export const brandCssVars = {
  "--color-dourado": brandColors.dourado,
  "--color-marrom": brandColors.marrom,
  "--color-creme": brandColors.creme,
  "--color-bronze": brandColors.bronze,
  "--color-terracota": brandColors.terracota,
} as const;
