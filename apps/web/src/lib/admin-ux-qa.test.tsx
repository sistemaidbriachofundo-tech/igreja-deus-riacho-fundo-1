import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberDirectory } from "../components/MemberDirectory";
import { ChurchCredentials } from "../components/ChurchCredentials";

describe("Área administrativa: estados acessíveis e dados de avaliação", () => {
  it("o diretório oferece restauração deliberada e filtros identificáveis", () => {
    const html = renderToStaticMarkup(<MemberDirectory />);
    expect(html).toContain('aria-label="Restaurar base de avaliação"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Situação da membresia"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("PESSOAS &amp; RELACIONAMENTOS");
    expect(html).not.toContain("PESSOAS &amp; RELACIONAMENTOS / 2026");
  });

  it("a carteirinha sintética não apresenta ano fixo nem identidade oficial", () => {
    const html = renderToStaticMarkup(<ChurchCredentials />);
    expect(html).toContain("MEMBRESIA / DEMONSTRAÇÃO");
    expect(html).toContain("DOCUMENTO SEM VALIDADE");
    expect(html).toContain('aria-label="Filtrar carteirinhas"');
    expect(html).toContain('aria-pressed="true"');
  });
});
