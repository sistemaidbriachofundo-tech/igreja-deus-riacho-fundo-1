import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(join(__dirname, relative), "utf8");
const home = read("../app/page.tsx");
const portal = read("../components/PublicPortal.tsx");
const mobileMenu = read("../components/MobilePortalMenu.tsx");
const overview = read("../app/app/page.tsx");
const retiredDemoPath = join(__dirname, "../app/app/demo/page.tsx");

describe("V1: separação entre portal público e administração", () => {
  it("preserva login e área interna sem levar cadastro administrativo para a Home", () => {
    expect(home).toContain("<PublicPage>");
    expect(home).not.toContain('href="/app/membros/"');
    expect(portal).toContain('href="/login/"');
    expect(mobileMenu).toContain("Login");
    expect(overview).toContain("<ChurchDashboard />");
  });

  it("não publica a rota de demonstração e mantém a gestão autenticada", () => {
    expect(existsSync(retiredDemoPath)).toBe(false);
    expect(existsSync(join(__dirname, "../app/app/membros/page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "../app/app/secretaria/page.tsx"))).toBe(true);
  });
});
