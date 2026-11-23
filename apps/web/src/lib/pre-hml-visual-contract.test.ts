import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = (path: string) => readFileSync(join(__dirname, "..", "components", path), "utf8");

describe("gates de regressão visual antes de HML", () => {
  it("não oculta o menu ou notificações na largura de 320px", () => {
    const shell = css("app-shell.module.css");
    const mobile = shell.slice(shell.indexOf("@media (max-width: 350px)"));
    expect(mobile).toContain(".toolbar .hamburger { display: grid; }");
    expect(mobile).toContain(".toolbarAlerts { min-height: 44px; }");
    expect(mobile).toContain("display: inline-flex;");
    expect(mobile).not.toMatch(/\.toolbarAlerts\s*\{\s*display:\s*none/);
    expect(shell).toContain(".frame .content { overflow-x: clip; }");
  });

  it("mantém busca e marca administrativas neutras no painel", () => {
    const kit = css("ui/ui.module.css");
    const controls = kit.slice(kit.indexOf(".workspaceSearch {"));
    expect(controls).toContain("color: #3f464e");
    expect(controls).toContain("background: #f5f6f7");
    expect(controls).toContain("background: #f0f2f4");
    for (const legacy of ["#22382e", "#dce6de", "#35664e", "#173c2d", "#285d45"]) {
      expect(controls, legacy).not.toContain(legacy);
    }
  });

  it("preserva calendário compacto, configuração progressiva e líderes truncados", () => {
    const agenda = css("events-management/event-management.module.css");
    const ministry = css("ministry/ministry-home.module.css");
    const settings = css("system-rules-desk.module.css");
    expect(agenda).toContain(".agenda .calendarDayButton");
    expect(agenda).toContain("min-height: 44px");
    expect(ministry).toContain(".directoryLeadership > small:first-child");
    expect(ministry).toContain("-webkit-line-clamp: 2");
    expect(settings).toContain(".centralModuleCard");
    expect(settings).toContain("min-height: 92px");
  });
});
