import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChurchDashboard } from "../components/ChurchDashboard";
import { AppShell } from "../components/AppShell";

describe("ID Riacho 1 — dashboard administrativo", () => {
  it("não publica contagens locais como se fossem a congregação", () => {
    const html = renderToStaticMarkup(<ChurchDashboard />);
    expect(html).toContain("ID Riacho 1");
    expect(html).toContain("não publica números");
    expect(html).not.toContain("Ambiente de demonstração");
    expect(html).not.toContain("dados sintéticos");
    expect(html).not.toContain("412 membros");
    expect(html).not.toContain("87%");
  });
  it("mantém a marca e o aviso sem a faixa de atalhos", () => {
    const html = renderToStaticMarkup(<ChurchDashboard />);
    expect(html).toContain("Avisos");
    expect(html).toContain("logo-igreja-aprovada.webp");
    expect(html).not.toContain("Acesso rápido");
    expect(html).not.toContain("hero-oficial.jpg");
    expect(html).not.toContain("ID Riacho 1<br/>");
  });
  it("abre o menu administrativo sem diagnóstico nem Meu Espaço", () => {
    const html = renderToStaticMarkup(<AppShell active="visao" meta="Início"><p>Conteúdo</p></AppShell>);
    expect(html).toContain("Início");
    expect(html).not.toContain("Membros e famílias");
    expect(html).toContain("Secretaria");
    expect(html).toContain("Carteirinhas");
    expect(html).toContain("Mídia e conteúdo");
    expect(html).toContain("Conteúdo");
    expect(html).not.toContain("Demonstração com dados sintéticos");
    expect(html).not.toContain("Evolução do sistema");
    expect(html).not.toContain("Meu Espaço");
    expect(html).not.toContain("Ministérios e operação");
    expect(html.match(/>Sair</g)).toHaveLength(1);
  });
});
