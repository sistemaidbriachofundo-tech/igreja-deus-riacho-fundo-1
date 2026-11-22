import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dsColor, contrastRatio } from "./tokens";

const css = readFileSync(join(__dirname, "ui.module.css"), "utf8");
const shell = readFileSync(join(__dirname, "..", "app-shell.module.css"), "utf8");

describe("design system RF1 aprovado — base neutra + status funcional", () => {
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
    expect(shell).toContain("min-height: 44px");
    expect(shell).toMatch(/\.frame :is\(button, input, select, textarea, a\):focus-visible \{ outline: 3px solid #171717/);
    expect(shell).toContain(".rail :is(button, a):focus-visible { outline: 3px solid #c9a76b");
  });

  it("não usa marrom nem verde-lima como ação primária da área interna", () => {
    const files = [
      "roster-board.module.css",
      "das-operations.module.css",
      "events-board.module.css",
      "serving/member-schedule.module.css",
      "serving/serving.module.css",
      "ministry/monthly-roster-simulation.module.css",
      "ministry/roster-editor.module.css",
      "ministry/roster-showcase.module.css",
      "ministry-membership-catalog.module.css",
      "treasury-overview.module.css",
      "ui/ui.module.css",
      "ui/feedback-dialog.module.css",
      "operations-expansion.module.css",
      "membership-insights.module.css",
      "vivi-editorial-assistant.module.css",
      "site-media-library.module.css",
      "system-rules-desk.module.css",
      "events-management/public-event-registration.module.css",
      "portal-design-system.module.css",
      "secretaria/membership-map.module.css",
      "secretary-dossier.module.css",
    ];
    const forbidden = ["#4a2612", "#184f43", "#d7fa75", "#164439", "#174f3e", "#174c3e", "#24160f", "#153e34", "#173d30", "#6a3f23", "#1d4c39", "#074c37", "#126449", "#20554e", "#205a57"];
    for (const file of files) {
      const source = readFileSync(join(__dirname, "..", file), "utf8").toLowerCase();
      for (const color of forbidden) {
        expect(source, `${file} ainda usa ${color}`).not.toContain(color);
      }
    }
    expect(contrastRatio("#c9a76b", "#171717")).toBeGreaterThan(4.5);
    expect(contrastRatio("#c9a76b", "#ffffff")).toBeLessThan(3);
  });
});
