import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dsColor, contrastRatio } from "./tokens";

const css = readFileSync(join(__dirname, "ui.module.css"), "utf8");
const shell = readFileSync(join(__dirname, "..", "app-shell.module.css"), "utf8");
const institutional = readFileSync(join(__dirname, "..", "..", "app", "home-institutional.module.css"), "utf8");
const businessRules = readFileSync(join(__dirname, "..", "system-rules-desk.module.css"), "utf8");
const monthlyRoster = readFileSync(join(__dirname, "..", "ministry", "roster-showcase.module.css"), "utf8");

describe("design system RF1 aprovado — base neutra + status funcional", () => {
  it("preserva o site público em preto e branco, sem destaque laranja legado", () => {
    expect(institutional).toContain(".identityCopy strong { color: #242424");
    expect(institutional).toContain("color: #4b4b4b");
    expect(institutional).not.toMatch(/#9f390f|#a63e13/i);
  });
  it("preserva ações primárias pretas e separa o ouro decorativo", () => {
    expect(dsColor.brown).toBe("#171717");
    expect(dsColor.raised).toBe("#FFFFFF");
    expect(dsColor.gold).toBe("#C9A76B");
    expect(css).toMatch(/\.primary\s*\{[^}]*background:\s*var\(--ds-brown\)/);
  });
  it("diferencia estados em vez de pintar módulos inteiros", () => {
    expect(dsColor.success).toBe("#286B52");
    expect(dsColor.danger).toBe("#9C3041");
    expect(css).toContain(".statWarning");
    expect(css).toContain("#8A651F");
    expect(shell).toContain("--app-info: #294e70");
  });
  it("mantém legibilidade dos textos essenciais", () => {
    expect(contrastRatio(dsColor.ink, dsColor.raised)).toBeGreaterThan(15);
    expect(contrastRatio(dsColor.muted, dsColor.cream)).toBeGreaterThan(4.5);
    expect(contrastRatio(dsColor.success, dsColor.cream)).toBeGreaterThan(4.5);
    expect(contrastRatio(dsColor.danger, dsColor.cream)).toBeGreaterThan(4.5);
  });
  it("uniformiza Regras e Escalas com a paleta administrativa, sem modificar o portal público", () => {
    expect(shell).toContain("--app-text: var(--app-ink)");
    expect(shell).toContain("--app-surface-muted: var(--app-subtle)");
    expect(businessRules).toContain("var(--app-ink");
    expect(monthlyRoster).toContain("var(--app-border");
    expect(businessRules).toMatch(/\.desk :is\(a, button, select, input\):focus-visible/);
    expect(monthlyRoster).toMatch(/@media \(max-width: 390px\)/);
    expect(businessRules).not.toMatch(/#203c30|#255742|#dce4dd/i);
    expect(monthlyRoster).not.toMatch(/#18382c|#21523c|#cfdfd0/i);
  });

  it("preserva controles de 44px, foco e movimento reduzido", () => {
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain(".workspaceTabs");
    expect(shell).toContain("prefers-reduced-motion");
  });
});
