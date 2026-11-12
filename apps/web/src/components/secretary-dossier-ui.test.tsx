import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SecretaryDossier } from "./SecretaryDossier";
import { Ficha360Dialog } from "./secretaria/Ficha360Dialog";
import { fichaReducer, initialFichaState, type PersonDossier, type PersonRecord } from "./secretary-dossier";

describe("ficha da secretaria no primeiro render", () => {
  it("anuncia a abertura e não vaza o token nem simula campos gravados", () => {
    const html = renderToStaticMarkup(
      <SecretaryDossier
        token="token-ultrassecreto"
        personId="p-ana"
        households={[{ id: "h-demo", label: "Família Demo" }]}
        canEdit
        canReadDocuments={false}
        credential={{ known: true, activeCredentialId: null }}
        onClose={() => {}}
        onSessionExpired={() => {}}
      />,
    );
    expect(html).toContain("Abrindo ficha…");
    expect(html).not.toContain("p-ana");
    expect(html).toContain('data-can-edit="true"');
    expect(html).toContain("Cadastro de pessoa");
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
        canReadDocuments={false}
        credential={{ known: false }}
        onClose={() => {}}
        onSessionExpired={() => {}}
      />,
    );
    expect(html).toContain('data-can-edit="false"');
    expect(html).not.toContain("outro-token");
  });
});

function person(): PersonRecord {
  return {
    id: "p-bruno",
    displayName: "Bruno Demo Membro",
    email: "bruno.demo@example.test",
    status: "ACTIVE",
    householdId: "h-demo",
    kind: "MEMBER",
    isMinor: false,
    legalGuardianPersonId: null,
    updatedAt: "2026-11-01T12:00:00.000Z",
    photo: { status: "NONE", hasStorageKey: false },
  };
}

describe("ficha 360 pronta para edição", () => {
  it("mostra dados gerais, família, protocolo e documento e deixa situação somente leitura", () => {
    const record = person();
    const dossier: PersonDossier = {
      person: record,
      legalGuardian: null,
      dependents: [{ id: "p-menor", displayName: "Menor Demo", isMinor: true }],
      household: { id: "h-demo", label: "Família Demo", members: [{ id: record.id, displayName: record.displayName, isMinor: false }] },
      memberships: [{ id: "m-bruno", status: "ACTIVE", joinedAt: "2026-01-01T00:00:00.000Z", notes: "obs", updatedAt: "2026-11-01T12:00:00.000Z" }],
      admissionHistory: [{
        id: "adm-1",
        status: "AWAITING_DOCUMENTS",
        modality: "BATISMO",
        currentStep: "documents",
        checklist: { modalityRecorded: true, documentsComplete: false, secretariaApproved: false, pastorApproved: false },
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }],
    };
    const state = fichaReducer(initialFichaState, { type: "load-ok", data: { person: record, dossier }, elapsedMs: 4 });
    const html = renderToStaticMarkup(
      <Ficha360Dialog
        titleId="ficha-titulo"
        state={state}
        households={[{ id: "h-demo", label: "Família Demo" }]}
        canEdit
        canReadDocuments
        credential={{ known: true, activeCredentialId: null }}
        documents={[{
          admissionId: "adm-1",
          documents: [{ id: "doc-1", displayName: "comprovante-ficticio.pdf", contentType: "application/pdf", byteSize: 80, createdAt: "2026-01-03T00:00:00.000Z" }],
          failure: null,
        }]}
        onClose={() => {}}
        onEdit={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onReopen={() => {}}
        onSessionExpired={() => {}}
      />,
    );
    expect(html).toContain("Bruno Demo Membro");
    expect(html).toContain("Visão geral");
    expect(html).toContain("Histórico eclesiástico");
    expect(html).toContain("Dados e edição");
    expect(html).toContain("Admissões e documentos");
    expect(html).toContain("Família Demo");
    expect(html).toContain("Menor Demo");
    expect(html).toContain("Vínculo");
    expect(html).toContain("Ativo");
    // A ficha passa a abrir em modo leitura e não exige editar para consultar.
    expect(html).not.toContain('data-field="displayName"');
    expect(html).not.toContain('data-field="notes"');
    expect(html).not.toContain("comprovante-ficticio.pdf");
    expect(html).not.toContain("pastoral-cases");
    expect(html).not.toContain("outro-token");
  });
});
