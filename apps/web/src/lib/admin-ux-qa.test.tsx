import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberDirectory } from "../components/MemberDirectory";
import { ChurchCredentials } from "../components/ChurchCredentials";
import { CredentialDesk } from "../components/credentials/CredentialDesk";
import { renderAsRole, renderPending } from "./test-session";

describe("Área administrativa: estados acessíveis e dados de avaliação", () => {
  it("não mostra a base de avaliação enquanto a sessão do painel está pendente", () => {
    const html = renderPending(<MemberDirectory />);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain('aria-label="Restaurar base de avaliação"');
    expect(html).not.toContain("PESSOAS &amp; RELACIONAMENTOS");
  });

  it("o diretório da secretaria oferece restauração deliberada e filtros identificáveis", () => {
    const html = renderAsRole("SECRETARIA", <MemberDirectory />);
    expect(html).toContain('data-nav-state="ready"');
    expect(html).toContain('aria-label="Restaurar base de avaliação"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Situação da membresia"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("PESSOAS &amp; RELACIONAMENTOS");
    expect(html).not.toContain("PESSOAS &amp; RELACIONAMENTOS / 2026");
  });

  it("a carteirinha não abre o módulo antes da sessão do painel", () => {
    const html = renderPending(<ChurchCredentials />);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain("Verificando sessão");
    expect(html).not.toContain("DOCUMENTO OFICIAL");
  });

  it("a carteirinha identifica a própria sessão e oferece filtro, sem documento oficial", () => {
    const html = renderAsRole("SECRETARIA", <ChurchCredentials />);
    expect(html).toContain('data-nav-state="ready"');
    expect(html).toContain("Verificando sessão");
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
    expect(desk).toContain("Emitir");
    expect(desk).toContain("Sem credencial ativa");
    expect(desk).not.toContain("Visualizar");
  });
});
