import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) => readFileSync(join(__dirname, "..", relative), "utf8");
const main = source("components/ChurchWorkspace.tsx");
const shell = source("components/AppShell.tsx");
const style = source("components/church-workspace.module.css");
const globalStyle = source("app/globals.css");
const members = source("app/app/membros/page.tsx");
const secretary = source("app/app/secretaria/page.tsx");
const cards = source("app/app/membros/carteirinha/page.tsx");
const overview = source("app/app/page.tsx");
const brand = source("../IDENTIDADE_VISUAL.md");

describe("gestão operacional sintética e identidade da igreja", () => {
  it("usa as quatro telas reais, sem depender de navegação para exemplos de fluxo", () => {
    expect(overview).toContain('view="overview"');
    expect(members).toContain('view="members"');
    expect(secretary).toContain('view="secretary"');
    expect(cards).toContain('view="cards"');
    expect(shell).not.toContain('label: "Explorar demonstração"');
  });

  it("compartilha a mesma base sintética nos módulos", () => {
    expect(main).toContain("SYNTHETIC_STORE_KEY");
    expect(main).toContain("localStorage");
    expect(main).toContain("initialMembers()");
    expect(main).toContain("filterMembers(members");
    expect(main).toContain("createMember(members");
    expect(main).toContain("advanceAdmission(members");
    expect(main).toContain("setMemberCard(members");
    expect(main).toContain("Dados sintéticos");
  });

  it("separa a simulação local das operações autenticadas", () => {
    expect(main).not.toContain("apiPost(");
    expect(main).not.toContain("apiLogin(");
    expect(main).not.toContain("apiGet(");
    expect(main).toContain("nenhuma decisão oficial");
  });

  it("mantém a identidade visual exclusiva da igreja", () => {
    expect(brand).toContain("#4A2612");
    expect(brand).toContain("#D4AF37");
    expect(style).toContain(".identityCard");
    expect(globalStyle).toContain(".sidebar");
    expect(main).toContain("IGREJA DE DEUS");
    expect(main).not.toContain("Só para Moças");
  });

  it("apresenta responsividade e validações de acessibilidade", () => {
    expect(style).toContain("@media(max-width:690px)");
    expect(main).toContain('role="dialog"');
    expect(main).toContain("aria-label");
  });
});
