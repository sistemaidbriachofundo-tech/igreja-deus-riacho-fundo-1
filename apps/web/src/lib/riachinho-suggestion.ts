export type RiachinhoSuggestionTarget = "hero" | "gallery" | "alts";

export type RiachinhoParsedSuggestion = {
  target: RiachinhoSuggestionTarget;
  title?: string;
  accent?: string;
  description?: string;
  alts?: string[];
};

const FIELD =
  /^(?:[-*•]\s*)?(t[ií]tulo|destaque|descri[cç][aã]o|alt(?:ernativa)?(?:\s*(\d+))?)\s*[:：\-–]\s*(.+)$/i;

function normalizeFieldKey(raw: string): "title" | "accent" | "description" | "alt" {
  const key = raw.toLowerCase();
  if (key.startsWith("tít") || key.startsWith("tit")) return "title";
  if (key.startsWith("dest")) return "accent";
  if (key.startsWith("desc")) return "description";
  return "alt";
}

/**
 * Extrai campos estruturados da resposta do Riachinho para aplicar no formulário.
 * Sem campos reconhecidos, devolve null (usuário ainda pode copiar o texto).
 */
export function parseRiachinhoSuggestion(
  reply: string,
  preferred: RiachinhoSuggestionTarget = "hero",
): RiachinhoParsedSuggestion | null {
  const lines = reply.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: RiachinhoParsedSuggestion = { target: preferred };
  const alts: string[] = [];

  for (const line of lines) {
    const match = FIELD.exec(line);
    if (!match) continue;
    const kind = normalizeFieldKey(match[1]!);
    const altIndex = match[2] ? Number(match[2]) : undefined;
    const value = match[3]!.trim().replace(/^["“]|["”]$/g, "");
    if (!value) continue;
    if (kind === "title") out.title = value.slice(0, 110);
    else if (kind === "description") out.description = value.slice(0, 500);
    else if (kind === "accent") out.accent = value.slice(0, 110);
    else if (kind === "alt") {
      if (altIndex && altIndex >= 1 && altIndex <= 4) {
        alts[altIndex - 1] = value.slice(0, 220);
      } else {
        alts.push(value.slice(0, 220));
      }
    }
  }

  if (alts.some(Boolean)) {
    out.alts = Array.from({ length: 4 }, (_, i) => alts[i]).filter(
      (x): x is string => Boolean(x),
    );
    out.target = "alts";
  }

  if (!out.title && !out.accent && !out.description && !out.alts?.length) {
    return null;
  }
  return out;
}
