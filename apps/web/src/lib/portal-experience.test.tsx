import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortalMotion } from "../components/PortalMotion";
import { PortalJourney } from "../components/PortalJourney";
import { MinisterioEmFoco } from "../components/MinisterioEmFoco";
import { ministries } from "./portal-content";

describe("portal v3+ — camadas de experiência", () => {
  it("mantém as melhorias de rolagem não intrusivas e acessíveis", () => {
    const html = renderToStaticMarkup(<PortalMotion />);
    expect(html).toContain('aria-label="Voltar ao início da página"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("scaleX(");
  });

  it("navega entre seções públicas por âncoras reais", () => {
    const html = renderToStaticMarkup(<PortalJourney />);
    for (const id of ["inicio", "quem-somos", "ministries-title", "atmosfera", "agenda"]) {
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html).toContain('aria-current="location"');
  });

  it("mostra os cinco ministérios com abas acessíveis", () => {
    const html = renderToStaticMarkup(<MinisterioEmFoco />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html.match(/role="tab"/g)).toHaveLength(5);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    for (const item of ministries) {
      expect(html).toContain(item.name);
      expect(html).toContain(`ministry-tab-${ministries.indexOf(item)}`);
    }
    expect(html).toContain("IMAGEM ILUSTRATIVA");
  });
});
