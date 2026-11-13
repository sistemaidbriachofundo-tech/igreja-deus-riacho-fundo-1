import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectionDesk, parseGroups, parseTracks, parseStages, parseWalks } from "./ConnectionDesk";
import { PERSONA_AREAS, shellAreasForRoles } from "../lib/persona-navigation";
import { PortalHeader } from "./PublicPortal";

describe("Conexão logada, liderança e grupos", () => {
  it("impede navegação pública para grupos e trilhas", () => {
    const publicHtml = renderToStaticMarkup(<PortalHeader />);
    expect(publicHtml).not.toContain("/app/conexao/");
    expect(publicHtml).not.toContain("Grupos de Amizade");
    expect(publicHtml).toContain("Quem somos");
    expect(PERSONA_AREAS.find(area => area.key === "conexao")?.surface).toBe("admin");
  });
  it("não fornece acesso no menu a membros sem papel de liderança", () => {
    expect(shellAreasForRoles(["MEMBRO"]).some(area => area.key === "conexao")).toBe(false);
    expect(shellAreasForRoles(["PLATFORM_ADMIN"]).some(area => area.key === "conexao")).toBe(true);
    expect(shellAreasForRoles(["LIDER_MINISTERIO"]).some(area => area.key === "conexao")).toBe(true);
  });
  it("lê apenas registros reais da API, sem criar mentor ou grupo fictício", () => {
    expect(parseTracks({ tracks: [] })).toEqual([]);
    expect(parseGroups({ groups: [] })).toEqual([]);
    expect(parseWalks({ enrollments: [] })).toEqual([]);
    expect(parseStages({ stages: [] })).toEqual([]);
    expect(parseTracks({ tracks: [{ id: "t1", name: "Trilha Conexão" }] })[0].name).toBe("Trilha Conexão");
    expect(parseGroups({ groups: [{ id: "g1", name: "Grupo Centro", leaderPersonId: null, members: [{ id: "m1" }] }] })[0])
      .toMatchObject({ name: "Grupo Centro", memberCount: 1, leaderAssigned: false });
  });
  it("deixa a nova página atrás do gate de autenticação", () => {
    const html = renderToStaticMarkup(<ConnectionDesk />);
    expect(html).not.toContain("Grupo Centro");
  });
});
