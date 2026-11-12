import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { findSimultaneousBlocks, type PersonalAssignment, type RosterView } from "../../lib/serving-rosters";
import { MemberSpace } from "./MemberSpace";
import { MinistryRosterDesk } from "./MinistryRosterDesk";
import { ServingWorkspace } from "./ServingWorkspace";

const original = process.env.NEXT_PUBLIC_HML_ENABLED;
beforeEach(() => {
  process.env.NEXT_PUBLIC_HML_ENABLED = "false";
});
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_HML_ENABLED;
  else process.env.NEXT_PUBLIC_HML_ENABLED = original;
});

const noop = () => {};

const louvor: RosterView = {
  id: "r-louvor",
  ministryId: "m-louvor",
  title: "Louvor domingo",
  serviceAt: "2026-11-15T21:00:00.000Z",
  status: "PUBLISHED",
  slots: [
    {
      id: "s-voz",
      roleLabel: "Voz principal",
      requiresCouple: false,
      sortOrder: 0,
      assignments: [
        {
          id: "a-ana",
          slotId: "s-voz",
          personId: "p-ana",
          personName: "Ana",
          partnerPersonId: null,
          status: "CONFIRMED",
          substituteForId: null,
        },
      ],
    },
  ],
};

const outra: RosterView = {
  id: "r-outra",
  ministryId: "m-outra",
  title: "Escala da recepção",
  serviceAt: "2026-11-15T21:00:00.000Z",
  status: "PUBLISHED",
  slots: [
    {
      id: "s-porta",
      roleLabel: "Porta",
      requiresCouple: false,
      sortOrder: 0,
      assignments: [
        {
          id: "a-ana-2",
          slotId: "s-porta",
          personId: "p-ana",
          partnerPersonId: null,
          status: "PENDING",
          substituteForId: null,
        },
        {
          id: "a-alheia",
          slotId: "s-porta",
          personId: "pessoa-alheia",
          partnerPersonId: null,
          status: "CONFIRMED",
          substituteForId: null,
        },
      ],
    },
  ],
};

describe("telas de escala — o que a pessoa vê", () => {
  it("Atmosfera sem ministério na API não oferece cadastro nem lista gente", () => {
    const html = renderToStaticMarkup(
      <MinistryRosterDesk
        surface="atmosfera"
        ministry={null}
        rosters={[]}
        blocks={[]}
        roles={["PASTOR"]}
        actorPersonId="p-pastor"
        token="token-teste"
        busy={false}
        notice=""
        onCreate={noop}
        onAddSlot={noop}
        onAssign={noop}
        onConfirm={noop}
        onDecline={noop}
        onSubstitute={noop}
        onPublish={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("data-blocked=\"ministry\"");
    expect(html).not.toContain("Registrar escala");
    expect(html).not.toContain("pessoa-alheia");
  });

  it("Louvor mostra o conflito da pessoa e omite quem está só na outra escala", () => {
    const html = renderToStaticMarkup(
      <MinistryRosterDesk
        surface="louvor"
        ministry={{
          id: "m-louvor",
          name: "Louvor (demo)",
          slug: "louvor-demo",
          scheduleText: "Domingo 18h",
          leaderPersonId: null,
        }}
        rosters={[louvor]}
        blocks={findSimultaneousBlocks([louvor, outra])}
        roles={["PASTOR"]}
        actorPersonId="p-pastor"
        token="token-teste"
        busy={false}
        notice=""
        onCreate={noop}
        onAddSlot={noop}
        onAssign={noop}
        onConfirm={noop}
        onDecline={noop}
        onSubstitute={noop}
        onPublish={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain(">Ana<");
    expect(html).not.toContain("p-ana");
    expect(html).toContain("Escala da recepção");
    expect(html).toContain("posição neste dia");
    expect(html).toContain("data-blocked=\"rehearsal\"");
    expect(html).not.toContain("pessoa-alheia");
    expect(html).toContain("Pedir substituição");
  });

  it("escala fechada não oferece função, designação nem publicação", () => {
    const html = renderToStaticMarkup(
      <MinistryRosterDesk
        surface="louvor"
        ministry={{
          id: "m-louvor",
          name: "Louvor",
          slug: "louvor",
          scheduleText: null,
          leaderPersonId: null,
        }}
        rosters={[{ ...louvor, status: "CLOSED" }]}
        blocks={[]}
        roles={["SECRETARIA"]}
        actorPersonId="p-sec"
        token="token-teste"
        busy={false}
        notice=""
        onCreate={noop}
        onAddSlot={noop}
        onAssign={noop}
        onConfirm={noop}
        onDecline={noop}
        onSubstitute={noop}
        onPublish={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("Encerrada");
    expect(html).not.toContain("Designar");
    expect(html).not.toContain("Nova função neste horário");
    expect(html).not.toContain("Publicar escala");
    expect(html).not.toContain("Pedir substituição");
  });

  it("rascunho com função pode ser publicado e o membro não vê troca", () => {
    const draft: RosterView = {
      ...louvor,
      status: "DRAFT",
      slots: [
        {
          ...louvor.slots[0],
          assignments: [
            { ...louvor.slots[0].assignments[0], status: "PENDING" },
          ],
        },
      ],
    };
    const leader = renderToStaticMarkup(
      <MinistryRosterDesk
        surface="louvor"
        ministry={{ id: "m-louvor", name: "Louvor", slug: "louvor", scheduleText: null, leaderPersonId: null }}
        rosters={[draft]}
        blocks={[]}
        roles={["LIDER_MINISTERIO"]}
        actorPersonId="p-lider"
        token="token-teste"
        busy={false}
        notice=""
        onCreate={noop}
        onAddSlot={noop}
        onAssign={noop}
        onConfirm={noop}
        onDecline={noop}
        onSubstitute={noop}
        onPublish={noop}
        onClose={noop}
      />,
    );
    expect(leader).toContain("Publicar escala");
    expect(leader).toContain("Nova função neste horário");
    const member = renderToStaticMarkup(
      <MinistryRosterDesk
        surface="louvor"
        ministry={{ id: "m-louvor", name: "Louvor", slug: "louvor", scheduleText: null, leaderPersonId: null }}
        rosters={[draft]}
        blocks={[]}
        roles={["MEMBRO"]}
        actorPersonId="p-ana"
        token="token-teste"
        busy={false}
        notice=""
        onCreate={noop}
        onAddSlot={noop}
        onAssign={noop}
        onConfirm={noop}
        onDecline={noop}
        onSubstitute={noop}
        onPublish={noop}
        onClose={noop}
      />,
    );
    expect(member).toContain("Confirmar");
    expect(member).not.toContain("Pedir substituição");
    expect(member).not.toContain("Registrar escala");
  });

  it("Meu Espaço lista só a agenda recebida e não outra pessoa", () => {
    const mine: PersonalAssignment = {
      id: "a-minha",
      status: "PENDING",
      participation: "assignee",
      roleLabel: "Voz",
      title: "Louvor domingo",
      serviceAt: "2026-11-15T21:00:00.000Z",
      rosterStatus: "PUBLISHED",
      ministryName: "Louvor",
      ministrySlug: "louvor",
      sameDayConflict: true,
    };
    const html = renderToStaticMarkup(
      <MemberSpace
        assignments={[mine]}
        busy={false}
        notice="Participação confirmada."
        onConfirm={noop}
        onDecline={noop}
      />,
    );
    expect(html).toContain("Louvor domingo");
    expect(html).toContain("data-status=\"PENDING\"");
    expect(html).toContain("Confirmar");
    expect(html).toContain("data-persist=\"roster\"");
    expect(html).toContain("Você tem outra posição na escala deste dia.");
    expect(html).not.toContain("Permissão de listagem");
    expect(html).not.toContain("p-membro");
    expect(html).not.toContain("pessoa-alheia");
    expect(html).not.toContain("Pedir substituição");
  });

  it("sem homologação a página não consulta escala", () => {
    const html = renderToStaticMarkup(<ServingWorkspace surface="atmosfera" />);
    expect(html).toContain("Escalas indisponíveis neste endereço");
    expect(html).not.toContain("Integração bloqueada");
    expect(html).not.toContain("#133");
    expect(html).not.toContain("pessoa-alheia");
  });
});

describe("sondagem de listagem", () => {
  it("descarta o corpo de GET /rosters", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:9");
    const fetchMock = vi.fn(async () => ({
      status: 403,
      text: async () => JSON.stringify({ rosters: [{ title: "pessoa-alheia" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { probeChurchRosterList } = await import("../../lib/serving-client");
    const result = await probeChurchRosterList("token-teste");
    expect(result).toBe("forbidden");
    expect(result).not.toContain("pessoa-alheia");
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
