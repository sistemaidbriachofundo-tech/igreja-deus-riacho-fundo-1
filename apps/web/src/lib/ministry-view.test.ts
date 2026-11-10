import { describe, expect, it } from "vitest";
import { MINISTRY_PERSONAS, ministryAccess, ministryHref, ministryPanelTitle } from "./ministry-view";

describe("painel de ministério", () => {
  it("chama Homens pelo nome curto e preserva o nome oficial no restante", () => {
    expect(ministryPanelTitle({ name: "Homens de Ação", slug: "homens-de-acao" })).toBe("Homens");
    expect(ministryPanelTitle({ name: "Homens", slug: "homens" })).toBe("Homens");
    expect(ministryPanelTitle({ name: "Louvor", slug: "louvor" })).toBe("Louvor");
    expect(ministryPanelTitle({ name: "Jovens", slug: "jovens" })).toBe("Jovens");
  });

  it("monta o endereço com o id do ministério e o id da escala", () => {
    expect(ministryHref("min-homens", "escalas", "esc-01")).toBe(
      "/app/ministerios/?ministry=min-homens&aba=escalas&escala=esc-01",
    );
  });

  it("libera o painel para quatro papéis e recusa os outros quatro, inclusive líder de fora", () => {
    expect(MINISTRY_PERSONAS).toHaveLength(8);
    for (const role of MINISTRY_PERSONAS) {
      const own = ministryAccess(role, true);
      const foreign = ministryAccess(role, false);
      if (role === "LIDER_MINISTERIO") {
        expect(own).toBe("painel");
        expect(foreign).toBe("403");
      } else if (role === "SECRETARIA" || role === "PASTOR" || role === "PLATFORM_ADMIN") {
        expect(own).toBe("painel");
        expect(foreign).toBe("painel");
      } else {
        expect(own).toBe("403");
        expect(foreign).toBe("403");
      }
    }
  });
});
