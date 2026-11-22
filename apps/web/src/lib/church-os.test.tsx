import React from "react";
import { describe, expect, it } from "vitest";
import { ChurchDashboard } from "../components/ChurchDashboard";
import { MemberDirectory } from "../components/MemberDirectory";
import { ChurchSecretary } from "../components/ChurchSecretary";
import { ChurchCredentials } from "../components/ChurchCredentials";
import { AppShell } from "../components/AppShell";
import { renderAsRole, renderPending } from "./test-session";

describe("Church OS: renderização real de páginas", () => {
  it("não publica o início enquanto a sessão está pendente", () => {
    const html = renderPending(<ChurchDashboard />);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).toContain('aria-label="Carregando painel"');
    expect(html).not.toContain("não publica números");
    expect(html).not.toContain("Avisos");
    expect(html).not.toContain("412 membros");
  });

  it("renderiza o início sem números inventados depois da sessão administrativa", () => {
    const html = renderAsRole("PLATFORM_ADMIN", <ChurchDashboard />);
    expect(html).toContain('data-nav-state="ready"');
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

  it("não lista pessoas da base sintética antes da sessão", () => {
    const html = renderPending(<MemberDirectory />);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain("Marina Oliveira");
    expect(html).not.toContain("Nova pessoa");
  });

  it("renderiza o diretório da secretaria com filtros e ferramentas de gestão", () => {
    const html = renderAsRole("SECRETARIA", <MemberDirectory />);
    expect(html).toContain("Pessoas fazem a");
    expect(html).toContain("Exportar CSV");
    expect(html).toContain("Nova pessoa");
    expect(html).toContain("Membros ativos");
    expect(html).toContain("Marina Oliveira");
    expect(html).not.toContain("pessoas-sinteticas.webp");
  });

  it("não abre a jornada da secretaria antes da sessão", () => {
    const html = renderPending(<ChurchSecretary />);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain("Uma jornada de");
    expect(html).not.toContain("Protocolos abertos");
  });

  it("renderiza a Secretaria com etapas e pendências para o papel autorizado", () => {
    const html = renderAsRole("SECRETARIA", <ChurchSecretary />);
    expect(html).toContain("Uma jornada de");
    expect(html).toContain("Protocolos abertos");
    expect(html).toContain("Secretaria");
    expect(html).toContain("Perfil da simulação");
  });

  it("não monta a carteirinha antes da sessão do painel", () => {
    const html = renderPending(<ChurchCredentials />);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain("Verificando sessão");
    expect(html).not.toContain("DOCUMENTO OFICIAL");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("setMemberCard");
  });

  it("renderiza a área de carteirinhas pedindo a sessão da credencial antes de abrir o cartão", () => {
    const html = renderAsRole("SECRETARIA", <ChurchCredentials />);
    expect(html).toContain("Carteirinhas");
    expect(html).toContain("Verificando sessão");
    expect(html).not.toContain("DOCUMENTO OFICIAL");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("setMemberCard");
  });

  it("não marca módulo nem mostra a barra do celular sem sessão", () => {
    const html = renderPending(<AppShell active="visao" meta="Visão geral">Conteúdo</AppShell>);
    expect(html).toContain("Buscar no painel");
    expect(html).toContain("idb-riacho-oficial-transparente.svg");
    expect(html).not.toContain("Conteúdo");
    expect(html).not.toContain('aria-current="page"');
    expect(html).not.toContain('aria-label="Navegação principal no celular"');
  });

  it("fornece comando de busca global, rotas e logomarca para o administrador autenticado", () => {
    const html = renderAsRole("PLATFORM_ADMIN", <AppShell active="visao" meta="Visão geral">Conteúdo</AppShell>);
    expect(html).toContain("Buscar no painel");
    expect(html).toContain("idb-riacho-oficial-transparente.svg");
    expect(html).toContain("Conteúdo");
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Navegação principal no celular"');
  });
});
