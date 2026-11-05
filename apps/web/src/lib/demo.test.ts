import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Estes testes são smoke checks de publicação; os fluxos são exercitados
// por demo-domain.test.ts, não por busca de texto no JSX.
const read = (relative: string) => readFileSync(join(__dirname, relative), "utf8");
const demo = read("../app/app/demo/page.tsx");
const home = read("../app/page.tsx");
const portal = read("../components/PublicPortal.tsx");
const overview = read("../app/app/page.tsx");

describe("F2: descoberta e separação entre demonstração e produção", () => {
  it("mantém acesso navegável ao Church OS sem transformá-lo na home pública", () => {
    expect(home).toContain("<PublicPage>");
    expect(home).not.toContain('href="/app/membros/"');
    expect(portal).toContain('href="/app/"');
    expect(portal).toContain("Área interna (demonstração)");
    expect(overview).toContain("<ChurchDashboard />");
  });
  it("deixa claro que os perfis ilustrativos não autenticam", () => {
    expect(demo).toContain("Dados 100% fictícios");
    expect(demo).toContain("a seleção de perfis não é login");
  });
  it("não faz chamadas diretas à API real a partir do modo de demonstração", () => {
    expect(demo).not.toContain("apiLogin(");
    expect(demo).not.toContain("apiPost(");
    expect(demo).not.toContain("apiGet(");
  });
});
