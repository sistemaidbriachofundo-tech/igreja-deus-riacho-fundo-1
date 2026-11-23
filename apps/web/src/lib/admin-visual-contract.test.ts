import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

function css(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("contrato visual da área autenticada", () => {
  it("mantém o shell com alvo de 44px, drawer e safe-area", () => {
    const shell = css("components/app-shell.module.css");
    expect(shell).toContain("min-height: 44px");
    expect(shell).toMatch(/\.subItem\s*\{[^}]*min-height:\s*44px/);
    expect(shell).toMatch(/\.subSelected\s*\{[^}]*min-height:\s*44px/);
    expect(shell).toContain(".toolbar .hamburger { display: grid; }");
    expect(shell).not.toContain(".toolbarAlerts {\n    display: none;");
    expect(shell).toContain("env(safe-area-inset-bottom, 0px)");
    expect(shell).toContain("overflow-x: clip");
  });

  it("não deixa a paleta verde antiga nos controles compartilhados", () => {
    const ui = css("components/ui/ui.module.css");
    const shared = ui.slice(ui.indexOf("Shared controls for authenticated work screens"));
    for (const legacy of ["#255742", "#24513e", "#22382e", "#1b4935", "#174c3e", "#e8efe9"]) {
      expect(shared, legacy).not.toContain(legacy);
    }
    expect(shared).toContain("#171717");
    expect(css("components/app-shell.module.css")).toContain("--shell-highlight: #c9a76b");
    expect(shared).toMatch(/\.workspaceChoices > button\[aria-pressed="true"\]\s*\{[^}]*color:\s*#ffffff/);
  });

  it("preserva os cards públicos de eventos e não recolore a agenda do portal", () => {
    const portal = css("components/public-portal.module.css");
    const home = css("app/home-v3.module.css");
    const events = css("components/events-management/event-management.module.css");
    expect(portal).toContain(".eventCard{display:grid;grid-template-columns:73px 1fr 50px");
    expect(home).toContain(".agendaList .eventCard");
    expect(events).toContain(".agendaRow");
    expect(events).toContain(".card{border:1px solid #e8e8e8");
  });

  it("tira o hero verde enorme dos indicadores e alinha o Riachinho à base neutra", () => {
    const insights = css("components/membership-insights.module.css");
    const riachinho = css("components/vivi-editorial-assistant.module.css");
    expect(insights).not.toContain("linear-gradient(120deg,#0d2c27");
    expect(insights).toContain("background:#171717");
    expect(riachinho).not.toContain("#174c3e");
    expect(riachinho).toContain("#e9f6ea");
    expect(riachinho).toContain(".offline");
    expect(riachinho).toContain("min-height: 44px");
  });
});
