import { describe, expect, it } from "vitest";
import { parseRiachinhoSuggestion } from "./riachinho-suggestion";

describe("parseRiachinhoSuggestion", () => {
  it("parses hero fields from structured reply", () => {
    const parsed = parseRiachinhoSuggestion(
      [
        "Segue uma proposta:",
        "Título: Uma casa para crescer",
        "Destaque: em comunhão",
        "Descrição: Venha conhecer uma comunidade acolhedora no Riacho Fundo I.",
      ].join("\n"),
      "hero",
    );
    expect(parsed).toEqual({
      target: "hero",
      title: "Uma casa para crescer",
      accent: "em comunhão",
      description: "Venha conhecer uma comunidade acolhedora no Riacho Fundo I.",
    });
  });

  it("parses alt lines and marks target as alts", () => {
    const parsed = parseRiachinhoSuggestion(
      "Alt 1: Pessoa em louvor.\nAlt 2: Jovens no palco.",
      "gallery",
    );
    expect(parsed?.target).toBe("alts");
    expect(parsed?.alts).toEqual(["Pessoa em louvor.", "Jovens no palco.", undefined, undefined]);
  });

  it("keeps numbered alt text attached to its original photo slot", () => {
    const parsed = parseRiachinhoSuggestion("Alt 3: Jovens reunidos.", "alts");
    expect(parsed?.target).toBe("alts");
    expect(parsed?.alts).toEqual([undefined, undefined, "Jovens reunidos.", undefined]);
  });

  it("does not reorder numbered alt text when it arrives out of order", () => {
    const parsed = parseRiachinhoSuggestion(["Alt 4: Culto.", "Alt 2: Oração."].join("\n"), "alts");
    expect(parsed?.alts).toEqual([undefined, "Oração.", undefined, "Culto."]);
  });

  it("returns null when there are no structured fields", () => {
    expect(parseRiachinhoSuggestion("Olá! Eu sou o Riachinho.")).toBeNull();
  });
});
