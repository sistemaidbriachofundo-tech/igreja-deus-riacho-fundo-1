import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "roster-showcase.module.css"), "utf8");

describe("Escalas — contrato visual do workspace RF1", () => {
  it("usa a paleta semântica do painel em vez do tema verde legado", () => {
    expect(css).toContain("color: var(--app-ink, #222)");
    expect(css).toContain("background: var(--app-surface, #fff)");
    expect(css).toContain("var(--app-control-radius, 8px)");
    expect(css).not.toContain("#18382c");
    expect(css).not.toContain("#265d49");
  });

  it("preserva alvo de toque de 44px em filtros, navegação e ações", () => {
    expect(css).toContain("min-height: 44px");
    expect(css).toMatch(/\.monthNavigation button[^}]*min-width: 44px; min-height: 44px;/);
    expect(css).toMatch(/\.teamActions > \*, \.rowMenu summary \{ min-height: 44px; \}/);
  });

  it("organiza filtros em coluna única nos celulares estreitos sem cortar os controles", () => {
    expect(css).toContain("@media (max-width: 480px)");
    expect(css).toContain(".monthlyFilters { grid-template-columns: minmax(0, 1fr); margin-inline: 0; }");
    expect(css).toContain(".monthlyFilters > div { grid-column: auto; }");
  });
});
