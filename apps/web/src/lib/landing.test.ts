import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { events, getMinistry, ministries } from "./portal-content";

const file = (path: string) => join(__dirname, "..", path);
const read = (path: string) => readFileSync(file(path), "utf8");
const home = read("app/page.tsx");
const shell = read("components/PublicPortal.tsx");
const css = read("components/public-portal.module.css");

describe("portal V1: Início, Quem somos, Agenda e Login", () => {
  it("mantém as três seções na Home e o login separado", () => {
    expect(home).toContain("<PortalCinematicHero");
    expect(home).toContain("<PublishedAgenda");
    expect(home).toContain('id="quem-somos"');
    expect(home).toContain('id="agenda"');
    expect(read("components/PortalCinematicHero.tsx")).toContain('id="inicio"');
    expect(shell).toContain('href="/login/"');
    expect(shell).toContain('href: "/#quem-somos"');
    expect(shell).toContain('href: "/#agenda"');
    expect(shell).not.toContain("RiachinhoPublicChat");
  });

  it("usa links institucionais de retorno, sem reabrir páginas de conteúdo", () => {
    const about = read("app/a-igreja/page.tsx");
    const agenda = read("app/eventos/page.tsx");
    expect(about).toContain('sectionId="quem-somos"');
    expect(agenda).toContain('sectionId="agenda"');
    for (const name of ["contato", "visita", "ministerios", "novidades", "status", "design-system", "w1-estudio"]) {
      expect(existsSync(file("app/" + name + "/page.tsx")), name).toBe(false);
    }
  });

  it("preserva a fonte do catálogo ministerial apenas como dado, sem rota pública", () => {
    const slugs = ["jovens", "homens", "adolescentes", "mulheres", "atmosfera"];
    expect(ministries.map(({ slug }) => slug)).toEqual(slugs);
    expect(new Set(ministries.map(({ slug }) => slug)).size).toBe(5);
    for (const ministry of ministries) {
      expect(ministry.name.length).toBeGreaterThan(3);
      expect(getMinistry(ministry.slug)).toBe(ministry);
    }
    expect(existsSync(file("app/ministerios/[slug]/page.tsx"))).toBe(false);
  });

  it("não apresenta dados de agenda fictícios como eventos publicados", () => {
    expect(events).toHaveLength(5);
    expect(events.every((event) => event.date && event.time && event.ministry)).toBe(true);
    expect(home).not.toContain("events={events}");
    expect(home).not.toContain("events.slice");
    expect(read("components/PublicLiveSections.tsx")).toContain("Programação em atualização");
    expect(shell).not.toContain("Agenda ilustrativa");
  });

  it("preserva a identidade visual e a navegação acessível", () => {
    const images = join(__dirname, "../../public/images");
    for (const image of ["logo-igreja-aprovada.webp", "hero-oficial.jpg", "adoracao-oficial.jpg", "comunidade-oficial.jpg"]) {
      expect(existsSync(join(images, image)), image).toBe(true);
    }
    // Capa real enviada para a homologação, mantendo o restante do cadastro do Work.
    expect(existsSync(join(images, "fachada-igreja-riacho-fundo.jpg"))).toBe(true);
    expect(read("lib/site-layout.ts")).toContain('"/images/fachada-igreja-riacho-fundo.jpg"');
    expect(read("components/PortalCinematicHero.tsx")).toContain("PUBLIC_FACADE_IMAGE");
    expect(shell).toContain("logo-igreja-aprovada.webp");
    expect(css).toContain("prefers-reduced-motion");
    expect(shell).toContain("Pular para o conteúdo");
    expect(read("components/PortalDesktopNavigation.tsx")).toContain('aria-label="Navegação do site público"');
    expect(read("components/PublicSectionLink.tsx")).toContain('id: "quem-somos"');
    expect(read("components/MobilePortalMenu.tsx")).toContain('aria-label="Navegação do site público no celular"');
  });
});
