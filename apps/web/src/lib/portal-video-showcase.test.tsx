import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PortalVideoShowcase } from "../components/PortalVideoShowcase";
import { AppShell } from "../components/AppShell";

describe("Identidade institucional e canal", () => {
  it("exibe gravações da igreja com links oficiais e carrega o player após interação", () => {
    const html = renderToStaticMarkup(<PortalVideoShowcase />);
    expect(html).toContain("https://www.youtube.com/c/IDBRiachoFundo1IDB");
    expect(html).toContain("https://www.instagram.com/idbriacho_/");
    expect(html).toContain("https://www.youtube.com/watch?v=lTjvE8G_YAE");
    expect(html).toContain("Culto de Santa Ceia");
    expect(html).toContain("Quinta do Encontro");
    expect(html).toContain("Som de Gerações");
    expect(html).not.toContain("<iframe");
  });
  it("conserva o menu de gestão e a marca comum no estúdio", () => {
    const html = renderToStaticMarkup(<AppShell active="editorial" meta="Estúdio editorial"><p>Editor</p></AppShell>);
    expect(html).toContain("Estúdio editorial");
    expect(html).toContain("Mídia e conteúdo");
    expect(html).not.toContain("church-os-art.svg");
    expect(html).toContain("Gestão do site");
    expect(html).toContain("Secretaria");
    expect(html).not.toContain("Membros e famílias");
    expect(html).toContain("Editor");
  });
});
