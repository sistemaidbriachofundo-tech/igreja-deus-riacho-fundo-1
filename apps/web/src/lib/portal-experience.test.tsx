import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortalMotion } from "../components/PortalMotion";
import { PortalJourney } from "../components/PortalJourney";
import { MinisterioEmFoco } from "../components/MinisterioEmFoco";
import { FirstVisitFeature, VisitQuestions } from "../components/FirstVisit";
import { ministries } from "./portal-content";
import { MobilePortalMenu } from "../components/MobilePortalMenu";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PortalButton } from "../components/PortalButton";
import { PortalDesktopNavigation } from "../components/PortalDesktopNavigation";

describe("portal v3+ — camadas de experiência", () => {
  it("reproduz a direção de arte aprovada com componentes funcionais", () => {
    const html = renderToStaticMarkup(<PortalCinematicHero />);
    expect(html).toContain("Sua jornada com Deus");
    expect(html).toContain("pode começar aqui.");
    expect(html).toContain("Quero visitar");
    expect(html).toContain("Ver agenda");
    expect(html).toContain('aria-label="Explorar os cinco ministérios"');
    expect(html.match(/aria-label="Conhecer ministério /g)).toHaveLength(5);
    expect(html).toContain("ACOLHER &amp; SERVIR");
    expect(html).not.toContain("Culto de Celebração");
  });

  it("usa design system compartilhado em botões e navegação desktop", () => {
    const html = renderToStaticMarkup(<PortalButton href="/visita/" variant="gold" icon="calendar">Planejar visita</PortalButton>);
    const desktop = renderToStaticMarkup(<PortalDesktopNavigation />);
    expect(html).toContain("Planejar visita");
    expect(html).toContain('href="/visita/"');
    expect(desktop).toContain('aria-label="Navegação principal"');
    expect(desktop).toContain("Quem somos");
    expect(desktop).toContain("Atmosfera");
  });

  it("mantém as melhorias de rolagem não intrusivas e acessíveis", () => {
    const html = renderToStaticMarkup(<PortalMotion />);
    expect(html).toContain('aria-label="Voltar ao início da página"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("scaleX(");
  });

  it("preserva a navegação mobile acessível e permite fechamento ao navegar", () => {
    const html = renderToStaticMarkup(<MobilePortalMenu links={[{ href: "/visita/", label: "Primeira Visita" }]} />);
    expect(html).toContain('aria-label="Menu mobile"');
    expect(html).toContain("Primeira Visita");
    expect(html).toContain("Abrir menu de navegação");
  });

  it("navega entre seções públicas por âncoras reais", () => {
    const html = renderToStaticMarkup(<PortalJourney />);
    for (const id of ["inicio", "quem-somos", "ministries-title", "atmosfera", "primeira-visita"]) {
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html).toContain('aria-current="location"');
  });

  it("oferece orientação real de primeira visita sem inventar horários", () => {
    const feature = renderToStaticMarkup(<FirstVisitFeature />);
    const questions = renderToStaticMarkup(<VisitQuestions />);
    expect(feature).toContain('id="primeira-visita"');
    expect(feature).toContain("Planejar minha primeira visita");
    expect(feature).toContain("adoracao-oficial.jpg");
    expect(questions.match(/<details/g)).toHaveLength(4);
    expect(questions).toContain("perfil oficial");
    expect(questions).not.toContain("20h");
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
