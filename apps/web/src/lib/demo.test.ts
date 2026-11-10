import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Estes testes são smoke checks de publicação; os fluxos são exercitados
// por demo-domain.test.ts, não por busca de texto no JSX.
const read = (relative: string) => readFileSync(join(__dirname, relative), "utf8");
const demo = read("../app/app/demo/page.tsx");
const home = read("../app/page.tsx");
const portal = read("../components/PublicPortal.tsx");
const mobileMenu = read("../components/MobilePortalMenu.tsx");
const overview = read("../app/app/page.tsx");

describe("F2: descoberta e separação entre demonstração e produção", () => {
  it("mantém acesso navegável ao Church OS sem transformá-lo na home pública", () => {
    expect(home).toContain("<PublicPage>");
    expect(home).not.toContain('href="/app/membros/"');
    expect(portal).toContain('href="/login/"');
    expect(mobileMenu).toContain("Login");
    expect(overview).toContain("<ChurchDashboard />");
  });
  it("não guarda cadastro local no endereço antigo", () => {
    expect(demo).toContain("Esta página não guarda cadastros");
    expect(demo).not.toContain("localStorage");
    expect(demo).not.toContain("Dados 100% fictícios");
  });
  it("não faz chamadas diretas à API a partir do endereço antigo", () => {
    expect(demo).not.toContain("apiLogin(");
    expect(demo).not.toContain("apiPost(");
    expect(demo).not.toContain("apiGet(");
  });
});
