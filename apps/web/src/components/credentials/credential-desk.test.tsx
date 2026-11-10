import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CredentialDesk } from "./CredentialDesk";
import { CredentialFaces } from "./CredentialCard";
import type { CredentialCard } from "./credential-model";

const qr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>`;

function card(overrides: Partial<CredentialCard> = {}): CredentialCard {
  return {
    id: "cred-joao",
    status: "ACTIVE",
    displayName: "João Silva",
    churchName: "Igreja de Deus no Riacho Fundo I",
    qrPayload: "Q3JlZGVuY2lhbFByZXZpZXdUb2tlblNlbVBJSVllcw",
    issuedAt: "2026-11-04T15:00:00.000Z",
    revokedAt: null,
    personId: "person-joao",
    membershipId: "membership-joao-silva",
    ministryName: "Homens",
    qrSvg: qr,
    pdf: { hasFile: false, contentType: null, byteSize: null, generatedAt: null },
    ...overrides,
  };
}

describe("mesa de carteirinhas", () => {
  it("abre o cartão com frente, verso, PDF e impressão", () => {
    const html = renderToStaticMarkup(
      <CredentialDesk
        token={null}
        canManage
        memberships={[{
          membershipId: "membership-joao-silva",
          personId: "person-joao",
          displayName: "João Silva",
          membershipStatus: "ACTIVE",
          activeCredentialId: "cred-joao",
        }]}
        ownCard={null}
        previewCard={card()}
        initialOpen
      />,
    );
    expect(html).toContain("Visualizar");
    expect(html).toContain("João Silva");
    expect(html).toContain("Frente da carteirinha");
    expect(html).toContain("Verso da carteirinha");
    expect(html).toContain("Baixar PDF");
    expect(html).toContain("Imprimir");
    expect(html).toContain("Homens");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Homologação");
    expect(html).not.toMatch(/@example|mailto:|cpf|telefone/i);
    expect(html).not.toContain("localStorage");
  });

  it("mostra o QR revogado sem tratar a credencial como ativa", () => {
    const html = renderToStaticMarkup(
      <CredentialFaces
        card={card({
          status: "REVOKED",
          revokedAt: "2026-11-08T15:00:00.000Z",
          ministryName: null,
        })}
        verification={{ state: "revoked", label: "QR revogado. Esta credencial não é válida." }}
      />,
    );
    expect(html).toContain("Revogada");
    expect(html).toContain("QR revogado. Esta credencial não é válida.");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Homens");
  });
});
