import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (path: string) => readFileSync(join(__dirname, path), "utf8");
const workspace = src("./OperationalMinistryRules.tsx");
const system = src("./SystemRulesDesk.tsx");
const editor = src("./ministry/RosterModuleRulesEditor.tsx");
const css = src("./system-rules-desk.module.css");
const editorCss = src("./ministry/roster-editor.module.css");

describe("Gestão do Sistema: navegação compacta e configuração segura", () => {
  it("apresenta uma lista curta e abre as regras somente no diálogo", () => {
    expect(workspace).toContain("centralModuleGrid");
    expect(workspace).toContain('kind: "rules"');
    expect(workspace).toContain("<Modal open");
    expect(workspace).toContain("size=\"wide\"");
    expect(workspace).toContain("<RosterModuleRulesEditor");
    expect(workspace).not.toContain("<RosterModuleCatalog");
    expect(workspace).not.toContain("ministryHref(");
    expect(css).toContain("grid-template-columns: repeat(2,minmax(0,1fr))");
  });

  it("evita os três painéis aninhados e não cria acesso indireto ao ministério", () => {
    expect(system).toContain("Configurações por ministério");
    expect(system).not.toContain("Regras operacionais já configuráveis");
    expect(system).not.toContain("Atmosfera · Módulos e escalas");
    expect(workspace).toContain('access.roles.includes("PLATFORM_ADMIN")');
    expect(workspace).toContain('roster.permissions?.scope !== "ministry"');
    expect(workspace).toContain("const canEdit = allowed && scopeAllowed");
    expect(workspace).toContain("canEdit && selectedModule");
  });

  it("expõe assuntos menores sem renderizar o editor de módulos inteiro", () => {
    for (const name of ["Regras gerais", "Vagas por culto", "Habilitações", "Casais"]) {
      expect(editor).toContain(name);
    }
    expect(editor).toContain('role="tablist"');
    expect(editor).toContain('aria-selected={section === tab.id}');
    expect(editor).toContain('section === "gerais"');
    expect(editor).toContain('section === "vagas"');
    expect(editor).toContain('section === "habilitacoes"');
    expect(editor).toContain('section === "casais"');
    expect(editor).toContain('actions.onRulesSaved?.(saved.rules)');
    expect(editorCss).toContain('.ruleSection[data-compact="true"]');
    expect(editorCss).toContain(".ruleSaveBar");
  });

  it("mantém 44px de toque e cartões compactos para celular", () => {
    expect(css).toContain(".centralModuleCard");
    expect(css).toContain("min-height: 92px");
    expect(css).toContain(".centralConfigure");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (max-width: 480px)");
    expect(editorCss).toContain("@media(max-width:600px)");
  });
});
