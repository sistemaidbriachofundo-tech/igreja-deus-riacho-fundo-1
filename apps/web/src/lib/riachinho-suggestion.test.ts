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
    expect(parsed?.alts).toEqual(["Pessoa em louvor.", "Jovens no palco."]);
  });

  it("returns null when there are no structured fields", () => {
    expect(parseRiachinhoSuggestion("Olá! Eu sou o Riachinho.")).toBeNull();
  });
});
