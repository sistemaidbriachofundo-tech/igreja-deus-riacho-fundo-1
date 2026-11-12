import { describe, expect, it } from "vitest";
import { humanWriteNotice, MINISTRY_PERSONAS, ministryAccess, ministryHref, ministryPanelTitle, parseMinistryRoute } from "./ministry-view";

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

  it("preserva contexto por id, aceita link legado e prefere o parâmetro canônico", () => {
    expect(parseMinistryRoute("?ministry=min-mulheres&aba=integrantes")).toEqual({
      ministryId: "min-mulheres", tab: "integrantes", escalaId: undefined,
    });
    expect(parseMinistryRoute("?ministerio=min-adolescentes")).toEqual({
      ministryId: "min-adolescentes", tab: "visao", escalaId: undefined,
    });
    expect(parseMinistryRoute("?ministerio=min-antigo&ministry=min-homens&aba=escalas&escala=esc-01")).toEqual({
      ministryId: "min-homens", tab: "escalas", escalaId: "esc-01",
    });
    expect(parseMinistryRoute("?ministry=min-homens&aba=invalida")).toEqual({
      ministryId: "min-homens", tab: "visao", escalaId: undefined,
    });
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


describe("Retorno das alterações de equipe", () => {
  it("traduz confirmação sem expor o identificador da auditoria", () => {
    const message = humanWriteNotice("MINISTRY_MEMBERSHIP_CREATED", true, "O cadastro formal registrou a alteração. Auditoria segredo-123.");
    expect(message).toBe("A pessoa foi adicionada à equipe.");
    expect(message).not.toMatch(/auditoria|segredo-123/i);
  });
  it("explica que a retirada conserva o histórico", () => {
    expect(humanWriteNotice("MINISTRY_MEMBERSHIP_ENDED", true, "")).toContain("histórico foi preservado");
  });
});
