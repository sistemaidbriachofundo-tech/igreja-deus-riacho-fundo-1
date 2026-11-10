/**
 * Tokens isolados da fundação visual.
 * Nomes próprios (--ds-*), sem alterar as variáveis globais do portal.
 * A paleta parte da identidade da Igreja de Deus no Riacho Fundo I.
 * Lagoinha e Sara Nossa Terra entram só como princípio (acolhimento,
 * hierarquia, um convite claro). Nada de marca, slogan ou cor copiada.
 */

export const dsColor = {
  gold: "#D4AF37",
  brown: "#4A2612",
  cream: "#F7EDE0",
  raised: "#FFF9F3",
  bronze: "#B8742D",
  terracotta: "#C6583E",
  ink: "#4A2612",
  muted: "#6E4A36",
  line: "#9A7355",
  danger: "#8C2F22",
  success: "#0E5A38",
  onGold: "#4A2612",
  onDark: "#F7EDE0",
} as const;

export const dsType = {
  title: '"Montserrat", system-ui, sans-serif',
  body: '"Inter", system-ui, sans-serif',
  display: "clamp(1.45rem, 1.05rem + 1.2vw, 2rem)",
  h2: "clamp(1.35rem, 1.1rem + 1vw, 1.75rem)",
  bodySize: "1rem",
  small: "0.875rem",
  lineBody: 1.6,
} as const;

/** Superfície, borda, raio, espaço e foco. Mesmos nomes publicados em globals.css. */
export const dsSurface = {
  canvas: dsColor.cream,
  raised: dsColor.raised,
  inverse: dsColor.brown,
  darkCanvas: "#24160F",
  darkRaised: "#3A261C",
} as const;

export const dsEdge = {
  default: dsColor.line,
  strong: dsColor.brown,
  dark: "#C4A484",
} as const;

export const dsRadius = {
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  pill: "999px",
} as const;

export const dsSpace = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.5rem",
  6: "2rem",
  7: "3rem",
  8: "4rem",
} as const;

export const dsFocus = {
  ring: dsColor.brown,
  onInverse: dsColor.cream,
  width: "3px",
  offset: "3px",
} as const;

export const dsText = {
  primary: dsColor.ink,
  muted: dsColor.muted,
  onInverse: dsColor.onDark,
  onAccent: dsColor.onGold,
  bronze: "#7A4A16",
  /** Texto de apoio do portal. Substitui o #67797E medido no PR #120. */
  support: "#243E42",
  onDarkMuted: "#E7D3C0",
} as const;

/** Grade do conteúdo: 4 / 8 / 12 colunas. */
export const dsGrid = {
  maxWidth: "75rem",
  gap: "1rem",
  columnsMobile: 4,
  columnsTablet: 8,
  columnsDesktop: 12,
  tabletMin: "768px",
  desktopMin: "1440px",
  touchTarget: "2.75rem",
} as const;

export type ContrastPair = {
  name: string;
  fg: string;
  bg: string;
  /** 4.5 texto normal; 3 componentes e foco. */
  min: number;
};

export const dsApprovedPairs: readonly ContrastPair[] = [
  { name: "Texto sobre creme", fg: dsColor.ink, bg: dsColor.cream, min: 4.5 },
  { name: "Texto secundário sobre creme", fg: dsColor.muted, bg: dsColor.cream, min: 4.5 },
  { name: "Texto sobre superfície", fg: dsColor.ink, bg: dsColor.raised, min: 4.5 },
  { name: "Secundário sobre superfície", fg: dsColor.muted, bg: dsColor.raised, min: 4.5 },
  { name: "Creme sobre marrom", fg: dsColor.onDark, bg: dsColor.brown, min: 4.5 },
  { name: "Marrom sobre ouro", fg: dsColor.onGold, bg: dsColor.gold, min: 4.5 },
  { name: "Ouro sobre marrom", fg: dsColor.gold, bg: dsColor.brown, min: 4.5 },
  { name: "Creme sobre perigo", fg: dsColor.onDark, bg: dsColor.danger, min: 4.5 },
  { name: "Perigo sobre creme", fg: dsColor.danger, bg: dsColor.cream, min: 4.5 },
  { name: "Sucesso sobre creme", fg: dsColor.success, bg: dsColor.cream, min: 4.5 },
  { name: "Creme sobre sucesso", fg: dsColor.onDark, bg: dsColor.success, min: 4.5 },
  { name: "Borda sobre creme", fg: dsColor.line, bg: dsColor.cream, min: 3 },
  { name: "Borda sobre superfície", fg: dsColor.line, bg: dsColor.raised, min: 3 },
];

/** Pares da aparência escura do kit. O portal público não muda com este modo. */
export const dsDarkPairs: readonly ContrastPair[] = [
  { name: "Creme sobre canvas escuro", fg: dsColor.onDark, bg: dsSurface.darkCanvas, min: 4.5 },
  { name: "Creme sobre cartão escuro", fg: dsColor.onDark, bg: dsSurface.darkRaised, min: 4.5 },
  { name: "Texto secundário escuro", fg: dsText.onDarkMuted, bg: dsSurface.darkCanvas, min: 4.5 },
  { name: "Secundário sobre cartão escuro", fg: dsText.onDarkMuted, bg: dsSurface.darkRaised, min: 4.5 },
  { name: "Borda sobre canvas escuro", fg: dsEdge.dark, bg: dsSurface.darkCanvas, min: 3 },
  { name: "Foco claro sobre canvas escuro", fg: dsFocus.onInverse, bg: dsSurface.darkCanvas, min: 3 },
];

/** Fundos medidos no PR #120 e o texto que o token global passa a garantir. */
export const dsAuditedBackgrounds = ["#EDF1EA", "#E9ECE6", "#F7F7F3", "#F8F7F4", "#FFFDF9"] as const;

export const dsAuditedText: readonly ContrastPair[] = dsAuditedBackgrounds.flatMap((bg) => [
  { name: `Apoio sobre ${bg}`, fg: dsText.support, bg, min: 4.5 },
  { name: `Muted sobre ${bg}`, fg: dsText.muted, bg, min: 4.5 },
  { name: `Bronze de texto sobre ${bg}`, fg: dsText.bronze, bg, min: 4.5 },
]);

/** Combinações medidas que não passam e não devem ser usadas para texto. */
export const dsRejectedPairs: readonly ContrastPair[] = [
  { name: "Ouro sobre creme", fg: dsColor.gold, bg: dsColor.cream, min: 3 },
  { name: "Terracota sobre creme", fg: dsColor.terracotta, bg: dsColor.cream, min: 4.5 },
  { name: "Bronze sobre creme", fg: dsColor.bronze, bg: dsColor.cream, min: 4.5 },
];

function channel(hex: string, index: number): number {
  const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const r = channel(hex, 0);
  const g = channel(hex, 1);
  const b = channel(hex, 2);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão WCAG entre duas cores #RRGGBB. */
export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}
