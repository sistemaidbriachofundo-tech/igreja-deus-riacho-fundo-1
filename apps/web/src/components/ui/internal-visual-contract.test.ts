import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

const ui = read("components", "ui", "ui.module.css");
const shell = read("components", "app-shell.module.css");
const insights = read("components", "membership-insights.module.css");
const secretary = read("components", "church-secretary.module.css");
const reports = read("components", "reports", "management-reports.module.css");
const site = read("components", "site-manager.module.css");
const members = read("components", "member-directory.module.css");
const serving = read("components", "serving", "serving.module.css");
const agenda = read("app", "home-institutional.module.css");
const guest = read("app", "app", "convidado", "page.tsx");

describe("RF1 — padronização visual interna", () => {
  it("mantém alvos de toque de 44px no menu, na busca e nos submenus", () => {
    expect(shell).toContain("min-height: var(--shell-target, 44px)");
    expect(shell).toContain("width: var(--shell-target, 44px)");
    expect(shell).not.toMatch(/min-height:\s*3[0-9]px/);
    expect(shell).not.toMatch(/min-height:\s*4[0-3]px/);
  });

  it("usa a ação primária neutra e abas pretas do kit compartilhado", () => {
    expect(ui).toMatch(/\.workspacePrimary\s*\{[^}]*background:\s*#171717/);
    expect(ui).toContain("background: #171717; color: #ffffff;");
    expect(ui).not.toContain("#255742");
    expect(ui).not.toContain("#a8491b");
    expect(ui).not.toContain("#24513e");
  });

  it("reduz os heros internos altos que destoavam da área de trabalho", () => {
    expect(insights).not.toContain("min-height:274px");
    expect(insights).not.toContain("linear-gradient(120deg,#0d2c27");
    expect(insights).toContain("min-height:0");
    expect(secretary).not.toContain("min-height:208px");
    expect(secretary).not.toContain("clamp(30px,3.5vw,43px)");
    expect(site).not.toContain("min-height:188px");
    expect(reports).not.toContain("#a8491b");
    expect(reports).toContain("background: #171717");
  });

  it("deixa filtros e botões do diretório tocáveis, sem trilho horizontal", () => {
    expect(members).toContain("height:44px");
    expect(members).toContain("min-height:44px");
    expect(members).not.toContain("height:33px");
    expect(members).not.toContain("height:27px");
    expect(members).not.toContain("overflow-x:auto");
  });

  it("coloca a área de convidado no cabeçalho compartilhado", () => {
    expect(guest).toContain('appearance="workspace"');
    expect(guest).toContain("Minha área de convidado");
    expect(guest).not.toContain("sectionTitle");
  });

  it("preserva a capa pública, a agenda institucional e a agenda do membro", () => {
    expect(agenda).toContain(".agenda {\n  background: var(--portal-green);");
    expect(agenda).toContain(".identityCopy strong { color: #242424; font-weight: 800; }");
    expect(serving).toContain("font-size: clamp(1.6rem, 3vw, 2.2rem);");
    expect(serving).toContain("border-radius: 999px;");
    expect(serving).toContain('background: var(--app-primary,#535353);');
  });
});
