import { describe, expect, it } from "vitest";
import { LOUVOR_STARTER_POSITIONS } from "./RosterModuleRulesEditor";

describe("modelo editável de escala automática do Louvor", () => {
  it("disponibiliza as principais posições sem atribuir pessoas e sem gerar escala", () => {
    expect(LOUVOR_STARTER_POSITIONS).toHaveLength(6);
    expect(LOUVOR_STARTER_POSITIONS.map(item => item.qualification)).toEqual([
      "ministro", "bateria", "baixo", "teclado", "violao", "back_vocal",
    ]);
    expect(LOUVOR_STARTER_POSITIONS.every(item => item.count > 0 && item.couple === false)).toBe(true);
    expect(LOUVOR_STARTER_POSITIONS.reduce((total, item) => total + item.count, 0)).toBe(7);
  });
});
