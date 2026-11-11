import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PortalVideoShowcase } from "../components/PortalVideoShowcase";
import { AppShell } from "../components/AppShell";

describe("V7 — identidade institucional e canal", () => {
  it("oferece link oficial verificado sem inventar vídeos ou automação", () => {
    const html = renderToStaticMarkup(<PortalVideoShowcase />);
    expect(html).toContain("https://www.youtube.com/@IDBRiachoFundo1");
    expect(html).toContain("A mensagem continua");
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube.com/embed/");
    expect(html).toContain("Fotografia ilustrativa");
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
