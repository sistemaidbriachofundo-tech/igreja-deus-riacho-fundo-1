const PALETTES = [
  { bg: "#4A2612", mark: "#D4AF37" },
  { bg: "#0E5A38", mark: "#F7EDE0" },
  { bg: "#243E42", mark: "#D4AF37" },
  { bg: "#6E4A36", mark: "#F7EDE0" },
  { bg: "#8C2F22", mark: "#F7EDE0" },
  { bg: "#1F3A34", mark: "#D4AF37" },
] as const;

function paletteIndex(seed: string): number {
  let sum = 0;
  for (const char of seed) sum += char.charCodeAt(0);
  return sum % PALETTES.length;
}

function initial(name: string): string {
  return (name.trim().charAt(0) || "M").toLocaleUpperCase("pt-BR");
}

/** Marca geométrica. Não usa fotografia de pessoa. */
export function SyntheticAvatar({ name }: { name: string }) {
  const palette = PALETTES[paletteIndex(name)];
  return (
    <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill={palette.bg} />
      <circle cx="48" cy="16" r="9" fill={palette.mark} />
      <path d="M6 54c10-16 16-20 26-20s16 8 26 20" fill="#F7EDE0" opacity="0.2" />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontSize="24"
        fontFamily="Montserrat, sans-serif"
        fontWeight="700"
        fill="#F7EDE0"
      >
        {initial(name)}
      </text>
    </svg>
  );
}
