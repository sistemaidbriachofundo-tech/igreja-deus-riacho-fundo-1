import { describe, expect, it } from "vitest";
import { treasurySectionFromHash, treasurySectionHref, treasurySidebarItems } from "./treasury-navigation";

describe("submenu lateral da Tesouraria", () => {
  it("permite ao tesoureiro consultar, cadastrar e acompanhar a aprovação", () => {
    const sections = treasurySidebarItems(["TESOURARIA"]).map(item => item.section);
    expect(sections).toEqual(["visao", "despesas", "lancar", "extrato", "conciliacao", "aprovacoes"]);
    expect(treasurySectionHref("lancar")).toBe("/app/tesouraria/#lancar");
  });
  it("restringe o pastor sem Tesouraria a aprovações, sem expor extrato nem cadastro", () => {
    expect(treasurySidebarItems(["PASTOR"]).map(item => item.section)).toEqual(["aprovacoes"]);
    expect(treasurySectionFromHash("#despesas", ["PASTOR"])).toBe("aprovacoes");
  });
  it("mostra consultas ao admin, sem fingir permissão para lançar ou aprovar", () => {
    expect(treasurySidebarItems(["PLATFORM_ADMIN"]).map(item => item.section))
      .toEqual(["visao", "despesas", "extrato", "conciliacao"]);
    expect(treasurySectionFromHash("#lancar", ["PLATFORM_ADMIN"])).toBe("visao");
  });
  it("não oferece nada a usuários sem perfil financeiro", () => {
    expect(treasurySidebarItems(["MEMBRO"])).toEqual([]);
    expect(treasurySidebarItems(["SECRETARIA"])).toEqual([]);
  });
  it("respeita deep links para seções válidas e volta à visão padrão para hashes desconhecidos", () => {
    expect(treasurySectionFromHash("#despesas", ["TESOURARIA"])).toBe("despesas");
    expect(treasurySectionFromHash("#lancar", ["TESOURARIA"])).toBe("lancar");
    expect(treasurySectionFromHash("#conciliacao", ["TESOURARIA"])).toBe("conciliacao");
    expect(treasurySectionFromHash("#aprovacoes", ["PASTOR"])).toBe("aprovacoes");
    expect(treasurySectionFromHash("#inexistente", ["TESOURARIA"])).toBe("visao");
  });
});
