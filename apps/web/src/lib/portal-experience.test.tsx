import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortalJourney } from "../components/PortalJourney";
import { MinisterioEmFoco } from "../components/MinisterioEmFoco";
import { FirstVisitFeature, VisitQuestions } from "../components/FirstVisit";
import { ministries } from "./portal-content";
import { MobilePortalMenu } from "../components/MobilePortalMenu";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PortalButton } from "../components/PortalButton";
import { PortalDesktopNavigation } from "../components/PortalDesktopNavigation";
import { PortalHeader, PortalFooter, PublicPage } from "../components/PublicPortal";
import { PortalFaithGallery } from "../components/PortalFaithGallery";

describe("portal v3+ — camadas de experiência", () => {
  it("reproduz a direção de arte aprovada com componentes funcionais", () => {
    const html = renderToStaticMarkup(<PortalCinematicHero />);
    expect(html).toContain("Igreja de Deus");
    expect(html).toContain("Riacho Fundo I");
    expect(html).not.toContain("Quero visitar");
    expect(html).toContain("Horários dos cultos");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Explorar os cinco ministérios"');
    expect(html).not.toContain('href="/ministerios');
    expect(html).not.toContain("Culto de Celebração");
  });

  it("exibe as oito fotos novas com descrições acessíveis", () => {
    const html = renderToStaticMarkup(<PortalFaithGallery />);
    expect(html).toContain("em fotos");
    expect(html).toContain('id="galeria"');
    expect(html.match(/<img /g)).toHaveLength(8);
    for (const image of ["palavra", "adoracao", "guitarra", "intercessao", "templo", "expressao", "louvor", "ceia"]) expect(html).toContain("/images/riacho/" + image + ".webp");
    expect(html).toContain('alt="Bandejas com os elementos da Santa Ceia."');
    expect(html).not.toContain("evento confirmado em 2026");
  });

  it("usa design system compartilhado em botões e navegação desktop", () => {
    const html = renderToStaticMarkup(<PortalButton href="/visita/" variant="gold" icon="calendar">Planejar visita</PortalButton>);
    const desktop = renderToStaticMarkup(<PortalDesktopNavigation />);
    expect(html).toContain("Planejar visita");
    expect(html).toContain('href="/visita"');
    expect(desktop).toContain('aria-label="Navegação do site público"');
    expect(desktop).toContain("Quem somos");
    expect(desktop).toContain("Início");
    expect(desktop).toContain("Agenda");
    expect(desktop).not.toContain("Ministérios");
    expect(desktop).not.toContain("Novidades");
  });

  it("mostra apenas Login no cabeçalho, sem chamadas comerciais e sem ministérios públicos", () => {
    const header = renderToStaticMarkup(<PortalHeader />);
    const mobile = renderToStaticMarkup(<MobilePortalMenu links={[]} />);
    const footer = renderToStaticMarkup(<PortalFooter />);
    const loginPos = header.indexOf(">Login</a>");
    const ctaPos = header.indexOf("Participe conosco");
    expect(loginPos).toBeGreaterThan(-1);
    expect(ctaPos).toBe(-1);
    expect(header).not.toContain("/ministerios");
    expect(header).not.toContain("Primeira visita");
    expect(header).toContain('href="/login');
    expect(header.match(/>Login<\/a>/g)).toHaveLength(1);
    expect(mobile).not.toContain("Login");
    expect(mobile).not.toContain("Ministérios");
    expect(footer).toContain(">Login</a>");
  });

  it("mantém o acesso ao conteúdo sem inserir controles flutuantes", () => {
    const html = renderToStaticMarkup(<PublicPage><main id="conteudo">Portal</main></PublicPage>);
    expect(html).toContain('href="#conteudo"');
    expect(html).not.toContain("Voltar ao início da página");
  });

  it("preserva a navegação mobile acessível e permite fechamento ao navegar", () => {
    const html = renderToStaticMarkup(<MobilePortalMenu links={[{ href: "/#inicio", label: "Início" },{ href: "/#quem-somos", label: "Quem somos" },{ href: "/#agenda", label: "Agenda" }]} />);
    expect(html).toContain('aria-label="Navegação do site público no celular"');
    expect(html).toContain('href="/#quem-somos"');
    expect(html).toContain('href="/#agenda"');
    expect(html).not.toContain('href="/a-igreja');
    expect(html).toContain("Quem somos");
    expect(html).toContain("Agenda");
    expect(html).not.toContain("Login");
    expect(html).not.toContain("Primeira visita");
    expect(html).toContain("Abrir menu");
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
