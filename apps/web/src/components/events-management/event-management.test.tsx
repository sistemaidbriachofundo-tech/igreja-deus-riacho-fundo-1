import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("../AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { EventManagementView } from "./EventManagementJourney";
import { EventPaymentField } from "./EventRegistrationDesk";
import { ReportsView } from "../reports/ManagementReports";

const noop = () => undefined;

describe("telas de eventos e relatórios", () => {
  it("não publica texto com e-mail e não mostra o menor", () => {
    const html = renderToStaticMarkup(<EventManagementView
      phase="ready"
      notice=""
      events={[{
        id: "e1", name: "Encontro", slug: "encontro", status: "DRAFT",
        description: "ana@example.test", locationText: "Salão", startsAt: "2026-12-01T19:00:00.000Z",
      }]}
      selected={{
        id: "e1", name: "Encontro", slug: "encontro", status: "PUBLISHED",
        description: "ana@example.test", locationText: "Salão", startsAt: "2026-12-01T19:00:00.000Z",
      }}
      creating={{ name: "", slug: "", description: "", locationText: "", startsAt: "" }}
      editing={{ name: "Encontro", slug: "encontro", description: "ana@example.test", locationText: "Salão", startsAt: "" }}
      registrations={[{
        id: "r1", status: "CONFIRMED", partySize: 1, isMinor: true,
        displayName: "", checkInCode: "", paymentStatus: "CONFIRMED_MOCK",
      }]}
      report={{
        counts: {
          registrations: 1, checkedIn: 0, participants: 1, presentParticipants: 0,
          minorsOmitted: 1, cancelled: 0, pendingPayment: 0, confirmedAwaitingPresence: 1,
        },
        rows: [],
      }}
      statusFilter="" from="" to="" participant="TESTE Participante" partySize={1}
      checkCode="" issuedCode="" busy={false}
      blockReason="Publicação bloqueada: revise nome, descrição ou local. O texto parece conter e-mail, telefone ou CPF."
      onCreating={noop} onEditing={noop} onCreate={noop} onSave={noop} onPublish={noop} onChoose={noop}
      onParticipant={noop} onPartySize={noop} onRegister={noop} onCheckCode={noop}
      onPresence={noop} onStatus={noop} onFrom={noop} onTo={noop} onReport={noop} onDownload={noop}
    />);
    expect(html).toContain("Publicação bloqueada");
    expect(html).toContain("Registro de menor omitido");
    expect(html).toContain("Menores omitidos");
    expect(html).toContain('href="#novo-evento"');
    expect(html).toContain("Cadastrar evento");
    expect(html).toContain("Calendário");
    expect(html).toContain("Lista");
    expect(html).toContain("Encontro");
    expect(html).not.toContain("TESTE Menor");
    expect(html).not.toContain("ana@example.test");
    expect(html).not.toContain("Registrar presença");
    expect(html).not.toMatch(/\bAPI\b|\bendpoint\b|\bdemo\b|501/);
    expect(html).toContain("disabled");
  });

  it("seleciona uma conta cadastrada e mantém visível a conta vinculada indisponível", () => {
    const field = renderToStaticMarkup(<EventPaymentField
      accounts={[{ id: "a1", name: "Conta de eventos" }]} value="a1" onChange={noop} />);
    expect(field).toContain("Conta da igreja para receber o Pix");
    expect(field).toContain('value="a1" selected=""');
    expect(field).toContain("Selecione a conta");
    const unavailable = renderToStaticMarkup(<EventPaymentField
      accounts={[]} value="a2" onChange={noop} />);
    expect(unavailable).toContain("Conta vinculada indisponível");
    expect(unavailable).toContain("Procure a Tesouraria");
  });

  it("estado sem homologação não finge contagem", () => {
    const html = renderToStaticMarkup(<EventManagementView
      phase="disabled" notice="" events={[]} selected={null}
      creating={{ name: "", slug: "", description: "", locationText: "", startsAt: "" }}
      editing={{ name: "", slug: "", description: "", locationText: "", startsAt: "" }}
      registrations={[]} report={null} statusFilter="" from="" to="" participant="" partySize={1}
      checkCode="" issuedCode="" busy={false} blockReason={null}
      onCreating={noop} onEditing={noop} onCreate={noop} onSave={noop} onPublish={noop} onChoose={noop}
      onParticipant={noop} onPartySize={noop} onRegister={noop} onCheckCode={noop}
      onPresence={noop} onStatus={noop} onFrom={noop} onTo={noop} onReport={noop} onDownload={noop}
    />);
    expect(html).toContain("Nenhum evento foi inventado");
    expect(html).not.toContain("Inscrições");
  });

  it("relatório ministerial marca integrante formal como bloqueado e esconde 403", () => {
    const ready = renderToStaticMarkup(<ReportsView
      phase="ready" notice="" busy={false}
      membershipLines={[{ label: "Membresia ACTIVE", value: "2" }, { label: "Menores omitidos", value: "1" }]}
      ministryLines={[{ label: "Integrantes formais", value: "BLOCKED" }, { label: "Jovens · interesses OPEN", value: "2" }]}
      membershipNote="Nomes não saem neste relatório."
      ministryNote="O vínculo formal de integrante não tem tabela."
      onDownload={noop}
    />);
    expect(ready).toContain("BLOCKED");
    expect(ready).toContain("Menores omitidos");
    expect(ready).not.toContain("@");
    const denied = renderToStaticMarkup(<ReportsView
      phase="forbidden" notice="Seu perfil não tem autorização para estes relatórios." busy={false}
      membershipLines={[]} ministryLines={[]} membershipNote="" ministryNote="" onDownload={noop}
    />);
    expect(denied).toContain("não tem autorização");
    expect(denied).not.toContain("BLOCKED");
    expect(denied).not.toContain("Membresia ACTIVE");
  });
});
