import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeskReady } from "../lib/ministry-desk";
import { MinistryMembershipCatalog } from "./MinistryMembershipCatalog";

const desk: DeskReady = {
  kind: "ready",
  ministries: [{ id: "min-homens", name: "Homens" }],
  ministry: { id: "min-homens", name: "Homens" },
  membership: {
    kind: "blocked",
    code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED",
    message: "Sem tabela de integrante.",
    members: null,
  },
  interests: [
    {
      id: "int-sint-01",
      displayName: "Pessoa Sintética",
      stage: "EQUIPE",
      status: "OPEN",
      formalMember: false,
    },
  ],
  interestsMessage: "Interesse de voluntariado. Não é vínculo formal com o ministério.",
  agenda: {
    kind: "blocked",
    code: "MINISTRY_AGENDA_MODEL_BLOCKED",
    message: "Agenda estruturada bloqueada.",
    scheduleText: "Sábado, 16h — encontro sintético",
    items: null,
  },
  requests: {
    kind: "blocked",
    code: "MINISTRY_REQUEST_MODEL_BLOCKED",
    message: "Solicitações bloqueadas.",
    requests: null,
  },
  finance: {
    kind: "blocked",
    code: "MINISTRY_FINANCE_CONTRACT_BLOCKED",
    message: "Saldo condicionado à issue 96.",
    balance: null,
    dependency: "issue-96",
  },
};

function region(html: string, name: string) {
  const start = html.indexOf(`data-region="${name}"`);
  const next = html.indexOf("data-region=", start + 10);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("MinistryMembershipCatalog", () => {
  it("mostra o interesse fora da equipe formal e não exibe saldo", () => {
    const html = renderToStaticMarkup(
      <MinistryMembershipCatalog
        desk={desk}
        conversion={null}
        convertingId={null}
        onSelect={() => undefined}
        onConvert={() => undefined}
      />,
    );
    const members = region(html, "formal-members");
    const interests = region(html, "volunteer-interests");
    expect(html).toContain("Homens");
    expect(html).toContain("MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED");
    expect(members).not.toContain("Pessoa Sintética");
    expect(interests).toContain("Pessoa Sintética");
    expect(interests).toContain("não é integrante");
    expect(html).toContain("Sábado, 16h — encontro sintético");
    expect(html).toContain("MINISTRY_FINANCE_CONTRACT_BLOCKED");
    expect(html).not.toContain("R$");
    expect(html).not.toContain("@");
  });

  it("a página nova não entra no shell de login nem no ledger", () => {
    const page = readFileSync(join(__dirname, "../app/app/ministerios/page.tsx"), "utf8");
    const screen = readFileSync(join(__dirname, "MinistryDeskPage.tsx"), "utf8");
    const adapter = readFileSync(join(__dirname, "../lib/ministry-desk.ts"), "utf8");
    expect(page).toContain("MinistryDeskPage");
    expect(screen).not.toContain("FinanceBoard");
    expect(screen).not.toContain("HmlPhaseOne");
    expect(screen).not.toContain("AppShell");
    expect(screen).not.toContain("/rosters");
    expect(adapter).toContain("/ministry-scope/");
    expect(adapter).not.toContain("/rosters");
  });
});
