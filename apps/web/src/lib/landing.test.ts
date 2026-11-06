import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { events, getMinistry, ministries } from "./portal-content";

const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
const home = read("app/page.tsx");
const hub = read("app/ministerios/page.tsx");
const ministryPage = read("app/ministerios/[slug]/page.tsx");
const agenda = read("app/eventos/page.tsx");
const visit = read("app/visita/page.tsx");
const about = read("app/a-igreja/page.tsx");
const contact = read("app/contato/page.tsx");
const shell = read("components/PublicPortal.tsx");
const css = read("components/public-portal.module.css");
const appShell = read("components/AppShell.tsx");

describe("portal público da igreja", () => {
  it("coloca visitantes, igreja e ministérios antes do sistema administrativo", () => {
    expect(home).toContain("Existe um lugar");
    expect(home).toContain("Quero conhecer a igreja");
    expect(home).toContain("<MinisterioEmFoco");
    expect(home).toContain("Quero conhecer a igreja");
    expect(home).not.toContain("Abrir sistema");
    expect(home).not.toContain('href="/app/membros/"');
    expect(shell).toContain("Área interna");
    expect(shell).toContain("/app/");
    expect(appShell).toContain("Membros e famílias");
    expect(appShell).toContain("Estúdio editorial");
  });

  it("oferece cinco ministérios com caminhos públicos estáticos", () => {
    const slugs = ["jovens", "homens", "adolescentes", "mulheres", "atmosfera"];
    expect(ministries.map(({ slug }) => slug)).toEqual(slugs);
    expect(new Set(ministries.map(({ slug }) => slug)).size).toBe(5);
    for (const ministry of ministries) {
      expect(ministry.name.length).toBeGreaterThan(3);
      expect(ministry.pillars).toHaveLength(3);
      expect(getMinistry(ministry.slug)).toBe(ministry);
    }
    expect(ministryPage).toContain("generateStaticParams");
    expect(ministryPage).toContain("getMinistry(slug)");
    expect(hub).toContain("ministries.map");
  });

  it("marca explicitamente toda a agenda como demonstrativa", () => {
    expect(events).toHaveLength(5);
    expect(events.every((event) => event.date && event.time && event.ministry)).toBe(true);
    expect(agenda).toContain("<DemoNote");
    expect(home).toContain("<FirstVisitFeature");
    expect(home).not.toContain("events.slice");
    expect(home).not.toContain("Próximos encontros");
    expect(ministryPage).toContain('"/visita/?ministerio=" + ministry.slug');
    expect(ministryPage).not.toContain("Eventos demonstrativos");
    expect(shell).toContain("não são programação oficial");
  });

  it("preserva a logo aprovada e imagens existentes", () => {
    const images = join(__dirname, "../../public/images");
    expect(shell).toContain("logo-igreja-aprovada.webp");
    for (const image of ["logo-igreja-aprovada.webp", "hero-oficial.jpg", "adoracao-oficial.jpg", "comunidade-oficial.jpg"]) {
      expect(existsSync(join(images, image))).toBe(true);
    }
    expect(home).toContain("portalVisuals.hero");
    expect(shell).toContain("ministryJourneyItem");
    expect(css).toContain(".immersiveHero");
    expect(css).toContain(".ministryJourneyItem");
    expect(about).toContain("portalVisuals.hero");
    expect(contact).toContain("instagramUrl");
  });

  it("mantém estilos próprios, navegação mobile e acessibilidade", () => {
    expect(css).toContain("@media(max-width:750px)");
    expect(css).toContain("@media(max-width:480px)");
    expect(css).toContain("prefers-reduced-motion");
    expect(shell).toContain('aria-label="Navegação principal"');
    expect(shell).toContain("<MobilePortalMenu links={navigation} />");
    expect(read("components/MobilePortalMenu.tsx")).toContain('aria-label="Menu mobile"');
    expect(shell).toContain("Pular para o conteúdo");
    expect(shell).toContain('href="/visita/"');
    expect(visit).toContain("<VisitPlanner");
    expect(about).toContain('id="conteudo"');
  });
});
