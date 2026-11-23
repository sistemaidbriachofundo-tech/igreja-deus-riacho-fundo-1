import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(join(__dirname, relative), "utf8");
const ministryCss = read("./ministry/ministry-home.module.css");
const eventCss = read("./events-management/event-management.module.css");
const eventAgenda = read("./events-management/EventAgenda.tsx");
const rules = read("./SystemRulesDesk.tsx");
const central = read("./OperationalMinistryRules.tsx");
const apiController = read("../../../../api/src/ministries/ministries.controller.ts");
const apiService = read("../../../../api/src/ministries/ministries.service.ts");

describe("regressão da experiência visual e permissões", () => {
  it("os indicadores são cards separados e as lideranças não expandem a coluna indefinidamente", () => {
    expect(ministryCss).toContain(".directoryTotals > div {");
    expect(ministryCss).toContain("background: var(--app-surface, #fff)");
    expect(ministryCss).toContain(".directoryLeadership > small:first-child");
    expect(ministryCss).toContain("-webkit-line-clamp: 2");
    expect(ministryCss).toContain(".directoryList .directoryRow");
  });
  it("o calendário mostra dias compactos e mantém lista navegável, sem chips gigantes por célula", () => {
    expect(eventCss).toContain(".agenda .calendar :is(.day,.dayOutside) { padding: 2px; height: 48px");
    expect(eventCss).toContain(".agenda .calendarDayButton");
    expect(eventCss).toContain("min-height: 44px");
    expect(eventAgenda).toContain("setSelectedDay(");
    expect(eventAgenda).toContain("dayResults.slice(0, 5)");
    expect(eventAgenda).not.toContain("cell.events.map((event)");
  });
  it("o painel central não redireciona ao ministério e não permite salvar sem escopo verificado", () => {
    expect(rules).toContain("<OperationalMinistryRules />");
    expect(rules).not.toContain('href={withBasePath("/app/servir/atmosfera/?config=regras")}');
    expect(central).toContain('roster.permissions?.scope !== "ministry"');
    expect(central).toContain("scopeAllowed && modules");
    expect(central).toContain("hideMembershipLinks: true");
    expect(apiController).toContain('@Patch(":ministryId/roster-modules/:moduleId/rules")');
    expect(apiService).toContain("this.assertManageMinistry(actor, ministry)");
  });
});
