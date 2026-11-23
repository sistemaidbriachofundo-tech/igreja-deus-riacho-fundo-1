import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OC_TEAM_OPTIONS, ServiceOrderTeamPanel } from "./ServiceOrderTeamPanel";

describe("OC: cadastro de integrantes", () => {
  it("mostra todas as funções do roteiro sem confundi-las com perfis de acesso", () => {
    expect(OC_TEAM_OPTIONS.map(role => role.key)).toEqual([
      "pastor", "director", "preacher", "praise", "welcome", "media", "generosity", "prayer", "instrumental",
    ]);
    const html = renderToStaticMarkup(<ServiceOrderTeamPanel token="fake" canEdit />);
    expect(html).toContain("Integrantes da Ordem do Culto");
    expect(html).toContain("sem criar cadastros duplicados");
    expect(html).not.toContain("Senha");
  });
  it("preserva a exibição consultiva da gestão pastoral", () => {
    const html = renderToStaticMarkup(<ServiceOrderTeamPanel token="fake" canEdit={false} />);
    expect(html).toContain("Integrantes da Ordem do Culto");
  });
});
