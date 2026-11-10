import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeskReady } from "../../lib/ministry-desk";
import { MinistryExperience } from "./MinistryExperience";

const ready: DeskReady = {
  kind: "ready",
  ministries: [
    { id: "min-homens", name: "Homens de Ação", slug: "homens", scheduleText: "Sábado, 16h — encontro sintético" },
    { id: "min-louvor", name: "Louvor", slug: "louvor" },
    { id: "min-jovens", name: "Jovens", slug: "jovens" },
  ],
  ministry: {
    id: "min-homens",
    name: "Homens de Ação",
    slug: "homens",
    description: "Encontro de homens da congregação.",
    scheduleText: "Sábado, 16h — encontro sintético",
    leadership: [{ displayName: "João Carvalho", roleTitle: "Liderança" }],
  },
  membership: {
    kind: "ready",
    members: [],
    message: "O cadastro formal respondeu sem integrantes.",
  },
  interests: [
    {
      id: "int-sint-01",
      displayName: "Pedro Almeida",
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

const quiet = {
  conversion: null,
  convertingId: null,
  change: null,
  pending: false,
  onSelect: () => undefined,
  onTab: () => undefined,
  onOpenEscala: () => undefined,
  onConvert: () => undefined,
  onAdmit: () => undefined,
  onEnd: () => undefined,
  onRefresh: () => undefined,
};

function render(tab: "visao" | "integrantes" | "escalas" | "atividades" | "recursos" = "visao") {
  return renderToStaticMarkup(
    <MinistryExperience
      desk={ready}
      escalas={{
        kind: "ready",
        items: [
          {
            id: "esc-homens-01",
            title: "Recepção de sábado",
            serviceAt: "2026-11-14T19:00:00.000Z",
            status: "PUBLISHED",
            functions: ["Recepção"],
            assignedCount: 2,
          },
        ],
      }}
      activities={{
        kind: "ready",
        items: [
          {
            id: "evt-homens",
            name: "Café dos homens",
            startsAt: "2026-11-21T12:00:00.000Z",
            locationText: "Salão",
            status: "PUBLISHED",
          },
        ],
      }}
      tab={tab}
      {...quiet}
    />,
  );
}

describe("experiência de ministérios", () => {
  it("abre Homens com as cinco abas, sem caixa na navegação e sem jargão", () => {
    const html = render("visao");
    expect(html).toContain("Homens");
    expect(html).toContain("Homens de Ação");
    expect(html).toContain("Louvor");
    expect(html).toContain("Jovens");
    for (const label of ["Visão geral", "Integrantes", "Escalas", "Atividades", "Recursos autorizados"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('role="tablist"');
    expect(html).toContain("João Carvalho");
    expect(html).toContain("Sábado, 16h — encontro sintético");
    expect(html).not.toContain("/app/servir/meu-espaco/");
    expect(html).toContain("ministry=min-homens");
    expect(html).not.toContain("Caixa do ministério");
    expect(html).not.toContain(">501<");
    expect(html).not.toContain("schema");
    expect(html).not.toContain("endpoint");
    expect(html).not.toContain("demo");
    expect(html).not.toContain("BLOCKED");
    expect(html).not.toContain("roster");
    expect(html).not.toContain("R$");
    expect(html).not.toContain("900");
  });

  it("liga a escala pelo id e não mistura interesse com integrante", () => {
    const escalas = render("escalas");
    expect(escalas).toContain("esc-homens-01");
    expect(escalas).toContain("aba=escalas");
    expect(escalas).toContain("escala=esc-homens-01");
    expect(escalas).toContain("Recepção de sábado");
    expect(escalas).not.toContain("Pedro Almeida");

    const integrantes = render("integrantes");
    const members = integrantes.slice(integrantes.indexOf('data-region="formal-members"'));
    const interests = integrantes.slice(integrantes.indexOf('data-region="volunteer-interests"'));
    expect(members.slice(0, interests.length ? members.indexOf('data-region="volunteer-interests"') : undefined)).not.toContain(
      "Pedro Almeida",
    );
    expect(interests).toContain("Pedro Almeida");
    expect(interests).toContain("não é integrante");
    expect(integrantes).toContain("Nenhum integrante formal");
    expect(integrantes).toContain("Incluir no vínculo formal");
  });

  it("mostra atividade do próprio ministério e deixa o caixa fora das abas", () => {
    const atividades = render("atividades");
    expect(atividades).toContain("Café dos homens");
    expect(atividades).not.toContain("Saldo ainda indisponível");

    const recursos = render("recursos");
    expect(recursos).toContain("Saldo ainda indisponível");
    expect(recursos).not.toContain("R$");
    expect(recursos).not.toContain("Pedidos internos");
  });

  it("responde 403 sem integrantes, escala ou saldo", () => {
    const html = renderToStaticMarkup(
      <MinistryExperience
        desk={{
          kind: "denied",
          ministries: [{ id: "min-homens", name: "Homens", slug: "homens" }],
          ministry: { id: "min-mulheres", name: "Mulheres", slug: "mulheres" },
          status: 403,
          code: "MINISTRY_SCOPE_FORBIDDEN",
          message: "Líder só visualiza dados do ministério autorizado.",
        }}
        escalas={{ kind: "hidden" }}
        activities={{ kind: "hidden" }}
        tab="visao"
        {...quiet}
      />,
    );
    expect(html).toContain('data-status="403"');
    expect(html).toContain("Esta conta não abre este ministério.");
    expect(html).toContain("Homens");
    expect(html).not.toContain("Pedro Almeida");
    expect(html).not.toContain("Café dos homens");
    expect(html).not.toContain("R$");
    expect(html).not.toContain("MINISTRY_SCOPE_FORBIDDEN");
  });
});
