import { describe, expect, it } from "vitest";
import { ChurchDashboard } from "../components/ChurchDashboard";
import { AppShell } from "../components/AppShell";
import { renderAsRole, renderPending } from "./test-session";

describe("ID Riacho 1 — dashboard administrativo", () => {
  it("não publica a visão local antes de confirmar a sessão", () => {
    const html = renderPending(<ChurchDashboard />);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain("não publica números");
    expect(html).not.toContain("Avisos");
    expect(html).not.toContain("412 membros");
    expect(html).not.toContain("87%");
  });

  it("não publica contagens locais como se fossem a congregação", () => {
    const html = renderAsRole("PLATFORM_ADMIN", <ChurchDashboard />);
    expect(html).toContain("ID Riacho 1");
    expect(html).toContain("não publica números");
    expect(html).not.toContain("Ambiente de demonstração");
    expect(html).not.toContain("dados sintéticos");
    expect(html).not.toContain("412 membros");
    expect(html).not.toContain("87%");
  });

  it("mantém a marca e o aviso sem a faixa de atalhos", () => {
    const html = renderAsRole("PLATFORM_ADMIN", <ChurchDashboard />);
    expect(html).toContain("Avisos");
    expect(html).toContain("idb-riacho-oficial-transparente.svg");
    expect(html).not.toContain("Acesso rápido");
    expect(html).not.toContain("hero-oficial.jpg");
    expect(html).not.toContain("ID Riacho 1<br/>");
  });

  it("não abre módulos administrativos sem sessão", () => {
    const html = renderPending(<AppShell active="visao" meta="Início"><p>Conteúdo</p></AppShell>);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain("Secretaria");
    expect(html).not.toContain("Carteirinhas");
    expect(html).not.toContain("Mídia e conteúdo");
    expect(html).not.toContain("Conteúdo");
    expect(html).not.toContain('aria-label="Navegação principal no celular"');
  });

  it("abre o menu administrativo autenticado sem diagnóstico nem Meu Espaço", () => {
    const html = renderAsRole("PLATFORM_ADMIN", <AppShell active="visao" meta="Início"><p>Conteúdo</p></AppShell>);
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
