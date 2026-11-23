import { describe, expect, it } from "vitest";
import { ministryLeaderSummary } from "./ministry-leader-summary";

describe("cards do dashboard de ministérios", () => {
  it("não empilha todos os líderes num cartão nem perde a contagem", () => {
    const names = [
      "Mariana Dias Castro", "TESTE 3M Caio Fictício 9-3",
      "Caio Fictício 10-3", "TESTE 3M Caio Fictício 11-3",
      "Helena Carvalho", "Líder Atmosfera - ambiente de teste",
    ];
    const summary = ministryLeaderSummary(names);
    expect(summary.visible).toBe("Mariana Dias Castro, TESTE 3M Caio Fictício 9-3");
    expect(summary.remaining).toBe(4);
    expect(summary.full).toContain("Líder Atmosfera - ambiente de teste");
  });
  it("não mostra mais de dois nomes, limpa duplicados e tolera equipe vazia", () => {
    expect(ministryLeaderSummary(["Ana", "Ana ", " ", "Bruno"])).toEqual({
      visible: "Ana, Bruno", remaining: 0, full: "Ana, Bruno",
    });
    expect(ministryLeaderSummary([])).toEqual({ visible: "", remaining: 0, full: "" });
  });
});
