import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(join(__dirname, "../app/page.tsx"), "utf8");
const statusPage = readFileSync(
  join(__dirname, "../app/status/page.tsx"),
  "utf8",
);
const visaoPage = readFileSync(join(__dirname, "../app/app/page.tsx"), "utf8");
const membrosPage = readFileSync(
  join(__dirname, "../app/app/membros/page.tsx"),
  "utf8",
);
const appShell = readFileSync(
  join(__dirname, "../components/AppShell.tsx"),
  "utf8",
);
const globalsCss = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const publicImages = join(__dirname, "../../public/images");

describe("public portal + F2 shells (DAS / protótipo v5)", () => {
  it("keeps a single-congregation Portuguese hero with product CTAs", () => {
    expect(homePage).toContain("Igreja de Deus");
    expect(homePage).toContain("no Riacho Fundo I");
    expect(homePage).toContain("Uma igreja para Deus, pelas famílias");
    expect(homePage).toContain("Abrir sistema");
    expect(homePage).toContain("Área interna");
    expect(homePage).not.toMatch(/multi-?igreja|trocar congregação|church switcher/i);
  });

  it("uses official congregation photos, not Unsplash stock", () => {
    expect(homePage).toContain("hero-oficial.jpg");
    expect(homePage).toContain("comunidade-oficial.jpg");
    expect(homePage).toContain("adoracao-oficial.jpg");
    expect(homePage).not.toContain("hero-worship.jpg");
    expect(homePage).not.toContain("unsplash");
    expect(existsSync(join(publicImages, "hero-oficial.jpg"))).toBe(true);
    expect(existsSync(join(publicImages, "comunidade-oficial.jpg"))).toBe(true);
    expect(existsSync(join(publicImages, "adoracao-oficial.jpg"))).toBe(true);
    expect(globalsCss).toContain(".hero-photo");
    expect(globalsCss).toContain("ken-burns");
  });

  it("exposes F2 modules from prototype PRINCIPAL menu", () => {
    expect(homePage).toContain("Visão geral");
    expect(homePage).toContain("Membros e famílias");
    expect(homePage).toContain("Secretaria");
    expect(homePage).toContain("Carteirinhas");
    expect(homePage).toContain('id="acesso"');
    expect(appShell).toContain("Visão geral");
    expect(appShell).toContain("Membros e famílias");
    expect(appShell).toContain("Carteirinhas");
    expect(appShell).toContain('href: "/app/"');
    expect(visaoPage).toContain('view="overview"');
    expect(membrosPage).toContain("<MemberDirectory />");
  });

  it("does not invent F3+ modules in this slice", () => {
    expect(appShell).not.toMatch(/Financ|Escalas|Células|Eventos|Patrimônio|IA da/);
    expect(homePage).not.toMatch(/Finanças|Escalas|Dashboards interativos/);
  });

  it("moves engineering status off the homepage", () => {
    expect(homePage).not.toContain("Skeleton F1-SEC");
    expect(homePage).toContain('href="/status/"');
    expect(statusPage).toContain("Status do bootstrap");
    expect(statusPage).toContain("CI: lint → typecheck → test → build");
  });
});
