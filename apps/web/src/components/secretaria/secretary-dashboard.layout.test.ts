import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const source = readFileSync(join(__dirname, "SecretaryDashboard.tsx"), "utf8");
const styles = readFileSync(join(__dirname, "secretary-dashboard.module.css"), "utf8");
const workspace = readFileSync(join(root, "HmlPhaseOne.tsx"), "utf8");
const workspaceStyles = readFileSync(join(root, "hml-phase-one.module.css"), "utf8");

describe("Secretaria — qualidade estrutural do painel de HML", () => {
  it("não prende o dashboard numa coluna externa de relatórios", () => {
    expect(workspace).toContain('<div className={s.secretaryOverview}>');
    expect(workspace).not.toContain("<ReportDashboard>");
    expect(workspaceStyles).toMatch(/\.secretaryOverview\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  });
  it("preserva os indicadores reais e o contrato da API", () => {
    expect(source).toContain('"/persons/secretary-overview"');
    for (const id of ["overview.total", "overview.byCategory.membros", "overview.byCategory.em_admissao", "movements.byMonth", "movements.byYear"]) {
      expect(source).toContain(id);
    }
    expect(source).not.toContain("Math.random");
  });
  it("usa a identidade verde/dourado e a leitura em largura total", () => {
    expect(styles).toContain("--forest:#1d563f");
    expect(styles).toContain("--gold:#cba565");
    expect(styles).toContain(".hero{");
    expect(styles).toContain(".summary{");
    expect(styles).toContain(".top{");
    expect(styles).toContain(".demographics{");
  });
  it("responde em telas pequenas, com gráficos roláveis e números acessíveis", () => {
    expect(styles).toContain("@media(max-width:680px)");
    expect(styles).toContain("@media(max-width:390px)");
    expect(styles).toContain("overflow-x:auto");
    expect(source).toContain('role="region" aria-label="Gráfico de movimentações');
    expect(source).toContain("Ver os números do gráfico em tabela");
    expect(source).toContain('aria-pressed={activity === key}');
  });
  it("preserva busca de pessoas, acompanhamento e filtros de período", () => {
    expect(source).toContain("onOpenPerson(row.id)");
    expect(source).toContain("setGroupLimit");
    expect(source).toContain("setSelectedPeriod");
    expect(source).toContain("setUpcoming");
    expect(source).toContain("setAnnual");
  });
  it("não altera dados quando uma consulta falha", () => {
    expect(source).toContain("setError(true)");
    expect(source).toContain("Exibindo o último resultado carregado");
    expect(source).toContain("Os indicadores não serão substituídos por números de demonstração");
  });
});
