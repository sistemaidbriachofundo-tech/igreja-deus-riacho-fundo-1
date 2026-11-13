import { describe, expect, it } from "vitest";
import { treasuryMovementFromHash, treasuryMovementHash, treasurySectionFromHash, treasurySectionHref, treasurySidebarItems } from "./treasury-navigation";

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
  it("permite somente inclusão de despesa ao administrador, sem aprovações ou outros lançamentos", () => {
    expect(treasurySidebarItems(["PLATFORM_ADMIN"]).map(item => item.section))
      .toEqual(["visao", "despesas", "lancar", "extrato", "conciliacao"]);
    expect(treasurySectionFromHash("#lancar", ["PLATFORM_ADMIN"])).toBe("lancar");
  });
  it("não oferece nada a usuários sem perfil financeiro", () => {
    expect(treasurySidebarItems(["MEMBRO"])).toEqual([]);
    expect(treasurySidebarItems(["SECRETARIA"])).toEqual([]);
  });
  it("preserva a escolha de Pix, cartão e outros lançamentos ao navegar, sem converter tudo em despesa", () => {
    expect(treasuryMovementHash("despesa")).toBe("#lancar");
    expect(treasuryMovementHash("pix")).toBe("#lancar:pix");
    expect(treasuryMovementHash("cartao")).toBe("#lancar:cartao");
    expect(treasuryMovementFromHash("#lancar:pix")).toBe("pix");
    expect(treasuryMovementFromHash("#lancar:cartao")).toBe("cartao");
    expect(treasuryMovementFromHash("#lancar")).toBe("despesa");
    expect(treasurySectionFromHash("#lancar:pix", ["TESOURARIA"])).toBe("lancar");
    expect(treasurySectionFromHash("#lancar:pix", ["PLATFORM_ADMIN"])).toBe("lancar");
  });

  it("respeita deep links para seções válidas e volta à visão padrão para hashes desconhecidos", () => {
    expect(treasurySectionFromHash("#despesas", ["TESOURARIA"])).toBe("despesas");
    expect(treasurySectionFromHash("#lancar", ["TESOURARIA"])).toBe("lancar");
    expect(treasurySectionFromHash("#conciliacao", ["TESOURARIA"])).toBe("conciliacao");
    expect(treasurySectionFromHash("#aprovacoes", ["PASTOR"])).toBe("aprovacoes");
    expect(treasurySectionFromHash("#inexistente", ["TESOURARIA"])).toBe("visao");
  });
});
