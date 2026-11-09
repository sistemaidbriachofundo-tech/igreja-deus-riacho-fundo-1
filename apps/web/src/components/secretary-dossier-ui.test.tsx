import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SecretaryDossier } from "./SecretaryDossier";

describe("ficha da secretaria no primeiro render", () => {
  it("anuncia a abertura e não vaza o token nem simula campos gravados", () => {
    const html = renderToStaticMarkup(
      <SecretaryDossier
        token="token-ultrassecreto"
        personId="p-ana"
        households={[{ id: "h-demo", label: "Família Demo" }]}
        canEdit
        onClose={() => {}}
        onSessionExpired={() => {}}
      />,
    );
    expect(html).toContain("Abrindo ficha…");
    expect(html).toContain("p-ana");
    expect(html).toContain('data-can-edit="true"');
    expect(html).toContain("Somente dados fictícios");
    expect(html).not.toContain("token-ultrassecreto");
    expect(html).not.toContain("Salvar campos permitidos");
    expect(html).not.toContain("ana.demo@example.test");
  });

  it("marca consulta somente leitura quando o perfil não grava", () => {
    const html = renderToStaticMarkup(
      <SecretaryDossier
        token="outro-token"
        personId="p-bruno"
        households={[]}
        canEdit={false}
        onClose={() => {}}
        onSessionExpired={() => {}}
      />,
    );
    expect(html).toContain('data-can-edit="false"');
    expect(html).not.toContain("outro-token");
  });
});
