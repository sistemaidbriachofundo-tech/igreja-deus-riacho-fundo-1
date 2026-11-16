import { describe, expect, it } from "vitest";
import LegacyEditorialPage from "../app/app/editorial/page";
import SiteManagementPage from "../app/app/site/page";
import { areaAllowed, shellAreasForRoles } from "./persona-navigation";

describe("Acesso ao editor do portal", () => {
  it("mantém os endereços antigos no mesmo editor", () => {
    expect(LegacyEditorialPage).toBe(SiteManagementPage);
  });

  it("oferece um editor do portal e uma área de eventos distinta conforme o perfil", () => {
    const admin = shellAreasForRoles(["PLATFORM_ADMIN"]);
    expect(admin.filter(area => area.label === "Mídia e conteúdo").map(area => area.href)).toEqual(["/app/site/"]);
    expect(admin.find(area => area.key === "eventos-gestao")?.href).toBe("/app/eventos-gestao/");
    for (const role of ["EDITOR_SITE", "PUBLICADOR_SITE"]) {
      expect(areaAllowed([role], "site")).toBe(true);
      expect(areaAllowed([role], "eventos-gestao")).toBe(false);
    }
    expect(areaAllowed(["MEMBRO"], "site")).toBe(false);
  });
});
