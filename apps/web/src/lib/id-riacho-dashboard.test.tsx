import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChurchDashboard } from "../components/ChurchDashboard";
import { initialMembers, summarize } from "./church-synthetic";
import { AppShell } from "../components/AppShell";

describe("ID Riacho 1 — dashboard administrativo aprovado", () => {
  it("exibe a marca e os dados exclusivamente sintéticos calculados da fonte local", () => {
    const html = renderToStaticMarkup(<ChurchDashboard />);
    const stats = summarize(initialMembers());
    expect(html).toContain("Bem-vindo ao");
    expect(html).toContain("ID Riacho 1");
    expect(html).toContain("Ambiente de demonstração");
    expect(html).toContain("dados sintéticos");
    expect(html).toContain(String(stats.total));
    expect(html).toContain(String(stats.pending));
    expect(html).toContain(String(stats.issued));
    expect(html).not.toContain("412 membros");
    expect(html).not.toContain("87%");
  });
  it("reproduz a composição funcional sem criar ações administrativas fictícias", () => {
    const html = renderToStaticMarkup(<ChurchDashboard />);
    expect(html).toContain("Acesso rápido");
    expect(html).toContain("Processos e admissões");
    expect(html).toContain("Agenda da semana");
    expect(html).toContain("YouTube");
    expect(html).toContain("https://www.youtube.com/@IDBRiachoFundo1");
    expect(html).toContain("logo-igreja-aprovada.webp");
    expect(html).toContain("hero-oficial.jpg");
    expect(html).toContain("publicações oficialmente liberadas");
  });
  it("preserva navegação dos cinco módulos reais e aviso de demonstração", () => {
    const html = renderToStaticMarkup(<AppShell active="visao" meta="Área Administrativa"><p>Conteúdo</p></AppShell>);
    expect(html).toContain("Área Administrativa");
    expect(html).toContain("Membros e famílias");
    expect(html).toContain("Secretaria");
    expect(html).toContain("Carteirinhas");
    expect(html).toContain("Mídia e conteúdo");
    expect(html).toContain("Demonstração com dados sintéticos");
    expect(html).toContain("Gestão ministerial");
  });
});
