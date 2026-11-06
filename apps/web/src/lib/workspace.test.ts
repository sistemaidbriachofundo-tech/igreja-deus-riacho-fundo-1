import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(join(__dirname, "..", relative), "utf8");
const overview = read("app/app/page.tsx");
const members = read("app/app/membros/page.tsx");
const secretary = read("app/app/secretaria/page.tsx");
const credentials = read("app/app/membros/carteirinha/page.tsx");
const shell = read("components/AppShell.tsx");
const dashboard = read("components/ChurchDashboard.tsx");
const directory = read("components/MemberDirectory.tsx");
const admissions = read("components/ChurchSecretary.tsx");
const cards = read("components/ChurchCredentials.tsx");
const brand = read("../IDENTIDADE_VISUAL.md");
const uiStyles = [
  "components/app-shell.module.css",
  "components/church-dashboard.module.css",
  "components/member-directory.module.css",
  "components/church-secretary.module.css",
  "components/church-credentials.module.css",
];

describe("Church OS: experiência institucional", () => {
  it("usa experiências independentes para os quatro módulos oficiais", () => {
    expect(overview).toContain("<ChurchDashboard />");
    expect(members).toContain("<MemberDirectory />");
    expect(secretary).toContain("<ChurchSecretary />");
    expect(credentials).toContain("<ChurchCredentials />");
    expect(shell).not.toContain('label: "Explorar demonstração"');
  });
  it("preserva a identidade visual exclusiva da Igreja de Deus", () => {
    expect(brand).toContain("#4A2612");
    expect(brand).toContain("#D4AF37");
    expect(shell).toContain("logo-igreja-aprovada.webp");
    expect(directory).not.toContain("pessoas-sinteticas.webp");
    expect(directory).toContain("Avatar fictício");
    expect(dashboard).toContain("hero-oficial.jpg");
    expect(dashboard).toContain("FOTO DO ACERVO");
    expect(dashboard).toContain("ID Riacho 1");
    expect(dashboard).not.toContain("Só para Moças");
  });
  it("mantém a mesma fonte de dados fictícios para as quatro telas", () => {
    const hook = read("lib/use-church-records.ts");
    expect(hook).toContain("SYNTHETIC_STORE_KEY");
    expect(hook).toContain("isMembersDataset");
    for (const source of [dashboard,directory,admissions,cards]) {
      expect(source).toContain("useChurchRecords");
      expect(source).not.toContain("apiPost(");
      expect(source).not.toContain("apiLogin(");
    }
    expect(admissions).toContain("advanceAdmission(members");
    expect(cards).toContain("setMemberCard(members");
    expect(directory).toContain("createMember(members");
  });
  it("entrega ações reais para cada área, não botões decorativos", () => {
    expect(shell).toContain("Ctrl K");
    expect(shell).toContain("paletteOpen");
    expect(directory).toContain("downloadCsv(filtered)");
    expect(directory).toContain('view==="GRID"');
    expect(admissions).toContain("complete(activeMember)");
    expect(cards).toContain("changeCard(selected");
  });
  it("oferece responsividade com navegabilidade mobile e foco", () => {
    for (const file of uiStyles) {
      expect(existsSync(join(__dirname,"..",file))).toBe(true);
      const css = read(file);
      expect(css).toMatch(/@media\s*\(max-width:/);
      expect(css).toContain("border-radius");
    }
    expect(shell).toContain('aria-label="Navegação principal no celular"');
    expect(shell).toContain('role="dialog"');
    expect(directory).toContain('aria-label="Buscar pessoa, família ou ministério"');
  });
});
