import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PortalVideoShowcase } from "../components/PortalVideoShowcase";
import { AppShell } from "../components/AppShell";
import { PortalFooter } from "../components/PublicPortal";
import { renderAsRole, renderPending } from "./test-session";

describe("Identidade institucional e canal", () => {
  it("exibe gravações da igreja com links oficiais e carrega o player após interação", () => {
    const html = renderToStaticMarkup(<PortalVideoShowcase />);
    expect(html).toContain("https://www.youtube.com/c/IDBRiachoFundo1IDB");
    expect(renderToStaticMarkup(<PortalFooter />)).toContain("https://www.instagram.com/idbriacho_/");
    expect(html).toContain("https://www.youtube.com/watch?v=OXywPv_LoQQ");
    expect(html).toContain("19/11/2026");
    expect(html).toContain("Culto de Santa Ceia");
    expect(html).toContain("Quinta do Encontro");
    expect(html).toContain("12/11/2026");
    expect(html).not.toContain("<iframe");
  });
  it("não abre o estúdio enquanto a sessão está pendente", () => {
    const html = renderPending(<AppShell active="site" meta="Estúdio editorial"><p>Editor</p></AppShell>);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain("Estúdio editorial");
    expect(html).not.toContain("Editor");
    expect(html).not.toContain("/app/site/");
  });

  it("conserva o menu de gestão e a marca comum no estúdio do administrador", () => {
    const html = renderAsRole("PLATFORM_ADMIN", <AppShell active="site" meta="Estúdio editorial"><p>Editor</p></AppShell>);
    expect(html).toContain("Estúdio editorial");
    expect(html).toContain("Mídia e conteúdo");
    expect(html).not.toContain("church-os-art.svg");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("/app/editorial/");
    expect(html).toContain("Secretaria");
    expect(html).not.toContain("Membros e famílias");
    expect(html).toContain("Editor");
  });

  it("deixa o editor no site e fora da secretaria", () => {
    const html = renderAsRole("EDITOR_SITE", <AppShell active="site" meta="Estúdio editorial"><p>Editor</p></AppShell>);
    expect(html).toContain("Estúdio editorial");
    expect(html).toContain("Editor");
    expect(html).toContain("/app/site/");
    expect(html).not.toContain("/app/secretaria/");
    expect(html).not.toContain("/app/tesouraria/");
    const blocked = renderAsRole("EDITOR_SITE", <AppShell active="secretaria" meta="Secretaria"><p>PROTOCOLOS</p></AppShell>);
    expect(blocked).not.toContain("PROTOCOLOS");
    expect(blocked).toContain("Seu perfil não tem acesso a esta página");
  });
});
