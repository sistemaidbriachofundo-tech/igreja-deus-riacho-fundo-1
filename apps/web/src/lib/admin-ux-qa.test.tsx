import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberDirectory } from "../components/MemberDirectory";
import { ChurchCredentials } from "../components/ChurchCredentials";
import { CredentialDesk } from "../components/credentials/CredentialDesk";

describe("Área administrativa: estados acessíveis e dados de avaliação", () => {
  it("o diretório oferece restauração deliberada e filtros identificáveis", () => {
    const html = renderToStaticMarkup(<MemberDirectory />);
    expect(html).toContain('aria-label="Restaurar base de avaliação"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Situação da membresia"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("PESSOAS &amp; RELACIONAMENTOS");
    expect(html).not.toContain("PESSOAS &amp; RELACIONAMENTOS / 2026");
  });

  it("a carteirinha identifica homologação e oferece filtro, sem documento oficial", () => {
    const html = renderToStaticMarkup(<ChurchCredentials />);
    expect(html).toContain("Homologação");
    expect(html).not.toContain("DOCUMENTO OFICIAL");
    expect(html).not.toContain("MEMBRESIA / DEMONSTRAÇÃO");
    const desk = renderToStaticMarkup(
      <CredentialDesk
        token={null}
        canManage
        memberships={[{
          membershipId: "membership-joao",
          personId: "person-joao",
          displayName: "João Silva",
          membershipStatus: "ACTIVE",
          activeCredentialId: null,
        }]}
        ownCard={null}
      />,
    );
    expect(desk).toContain('aria-label="Filtrar carteirinhas"');
    expect(desk).toContain('aria-pressed="true"');
    expect(desk).toContain("Visualizar");
  });
});
