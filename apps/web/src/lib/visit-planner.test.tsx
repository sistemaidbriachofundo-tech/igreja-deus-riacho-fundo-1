import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisitPlanner } from "../components/VisitPlanner";
import { ministries } from "./portal-content";

describe("jornada interativa da primeira visita", () => {
  it("apresenta escolha de companhia sem coletar dados pessoais", () => {
    const html = renderToStaticMarkup(<VisitPlanner />);
    expect(html).toContain("Como você pretende");
    expect(html).toContain("Vou sozinho(a)");
    expect(html).toContain("Com minha família");
    expect(html).toContain("Com crianças");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Nenhuma informação é armazenada.");
    expect(html).toContain('disabled=""');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('aria-valuemax="3"');
    expect(html).not.toContain("<form");
  });

  it("tem contrato com cinco ministérios e canal oficial de contato", () => {
    expect(ministries.map((m) => m.slug)).toEqual(["jovens", "homens", "adolescentes", "mulheres", "atmosfera"]);
    const html = renderToStaticMarkup(<VisitPlanner />);
    expect(html).toContain("SEM CADASTRO");
    expect(html).toContain("Continuar");
  });
});
