import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dsColor, contrastRatio } from "./tokens";

const css = readFileSync(join(__dirname, "ui.module.css"), "utf8");
const shell = readFileSync(join(__dirname, "..", "app-shell.module.css"), "utf8");
const institutional = readFileSync(join(__dirname, "..", "..", "app", "home-institutional.module.css"), "utf8");

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
  it("preserva controles de 44px, foco e movimento reduzido", () => {
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain(".workspaceTabs");
    expect(shell).toContain("prefers-reduced-motion");
  });
});
