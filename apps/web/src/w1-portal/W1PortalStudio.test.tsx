import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { W1PortalStudio } from "./W1PortalStudio";
import { withBasePath } from "../lib/paths";

describe("estúdio W1 renderizado", () => {
  it("mostra a navegação pública, o bloqueio das dependências e o site oficial inativo", () => {
    const html = renderToStaticMarkup(<W1PortalStudio />);
    expect(html).toContain("Navegação do site público");
    expect(html).toContain("Início");
    expect(html).toContain("Quem somos");
    expect(html).toContain("Agenda");
    expect(html).toContain(`href="${withBasePath("/login/")}"`);
    expect(html).not.toContain("/ministerios");
    expect(html).not.toContain("Ministérios");
    expect(html).toContain("BLOCKED");
    expect(html).toContain("PR #102");
    expect(html).toContain("PR #101");
    expect(html).toContain("não ativa o site público");
    expect(html).toContain('data-official-site="inativo"');
    expect(html).toContain("Igreja de Deus no Riacho Fundo I");
    expect(html).toContain("A página oficial do site não é substituída");
  });
});
