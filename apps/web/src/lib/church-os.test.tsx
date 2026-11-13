import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChurchDashboard } from "../components/ChurchDashboard";
import { MemberDirectory } from "../components/MemberDirectory";
import { ChurchSecretary } from "../components/ChurchSecretary";
import { ChurchCredentials } from "../components/ChurchCredentials";
import { AppShell } from "../components/AppShell";

describe("Church OS: renderização real de páginas", () => {
  it("renderiza o início sem números inventados", () => {
    const html=renderToStaticMarkup(<ChurchDashboard />);
    expect(html).toContain("ID Riacho 1");
    expect(html).toContain("Início");
    expect(html).toContain("não publica números");
    expect(html).toContain("Avisos");
    expect(html).not.toContain("Pessoas cadastradas");
    expect(html).not.toContain("Ambiente de demonstração");
    expect(html).not.toContain("hero-oficial.jpg");
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
  it("renderiza a área de carteirinhas pedindo sessão antes de abrir o cartão", () => {
    const html=renderToStaticMarkup(<ChurchCredentials />);
    expect(html).toContain("Carteirinhas");
    expect(html).toContain("Verificando sessão");
    expect(html).toContain("Verificando sessão");
    expect(html).not.toContain("DOCUMENTO OFICIAL");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("setMemberCard");
  });
  it("fornece comando de busca global, rotas e logomarca correta", () => {
    const html=renderToStaticMarkup(<AppShell active="visao" meta="Visão geral">Conteúdo</AppShell>);
    expect(html).toContain("Buscar no painel");
    expect(html).toContain("idb-riacho-oficial-transparente.svg");
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Navegação principal no celular"');
  });
});
