import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChurchDashboard } from "../components/ChurchDashboard";
import { MemberDirectory } from "../components/MemberDirectory";
import { ChurchSecretary } from "../components/ChurchSecretary";
import { ChurchCredentials } from "../components/ChurchCredentials";
import { AppShell } from "../components/AppShell";

describe("Church OS: renderização real de páginas", () => {
  it("renderiza o painel com indicadores calculados da base sintética", () => {
    const html=renderToStaticMarkup(<ChurchDashboard />);
    expect(html).toContain("Bem-vindo ao");
    expect(html).toContain("ID Riacho 1");
    expect(html).toContain("Pessoas cadastradas");
    expect(html).toContain("19");
    expect(html).toContain("Acompanhar etapas e aprovações");
    expect(html).toContain("Ambiente de demonstração");
    expect(html).toContain("Membros ativos");
    expect(html).toContain("hero-oficial.jpg");
    expect(html).not.toContain("412 membros");
    expect(html).not.toContain("undefined");
  });
  it("renderiza o diretório com filtros e ferramentas de gestão", () => {
    const html=renderToStaticMarkup(<MemberDirectory />);
    expect(html).toContain("Pessoas fazem a");
    expect(html).toContain("Exportar CSV");
    expect(html).toContain("Nova pessoa");
    expect(html).toContain("Membros ativos");
    expect(html).toContain("Marina Oliveira");
    expect(html).not.toContain("pessoas-sinteticas.webp");
  });
  it("renderiza a Secretaria com etapas e pendências", () => {
    const html=renderToStaticMarkup(<ChurchSecretary />);
    expect(html).toContain("Uma jornada de");
    expect(html).toContain("Protocolos abertos");
    expect(html).toContain("Secretaria");
    expect(html).toContain("Perfil da simulação");
  });
  it("renderiza credencial identificada como sintética, sem validar QR", () => {
    const html=renderToStaticMarkup(<ChurchCredentials />);
    expect(html).toContain("Uma identidade que");
    expect(html).toContain("AMBIENTE DE TESTE");
    expect(html).toContain("Revogar carteirinha");
    expect(html).toContain("QR de verificação");
  });
  it("fornece comando de busca global, rotas e logomarca correta", () => {
    const html=renderToStaticMarkup(<AppShell active="visao" meta="Visão geral">Conteúdo</AppShell>);
    expect(html).toContain("Buscar módulos e páginas...");
    expect(html).toContain("logo-igreja-aprovada.webp");
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Navegação principal no celular"');
  });
});
