import { describe, expect, it } from "vitest";
import {
  BLOCKED_INTEGRATIONS,
  blocksForRoster,
  canConfirmAssignment,
  canSubstituteAssignment,
  churchDayKey,
  endpointsForSurface,
  findSameDayBlocks,
  findSimultaneousBlocks,
  parseMyAgenda,
  interpretRosterProbe,
  otherRosterTitles,
  parseMinistryList,
  parseRosterList,
  pickSurfaceMinistry,
  rostersForMinistry,
  type RosterView,
} from "./serving-rosters";

const AT = "2026-11-15T21:00:00.000Z";
const LATER = "2026-11-15T23:00:00.000Z";

function roster(partial: Partial<RosterView> & Pick<RosterView, "id" | "title" | "serviceAt">): RosterView {
  return {
    ministryId: partial.ministryId ?? "min-louvor",
    status: partial.status ?? "PUBLISHED",
    slots: partial.slots ?? [],
    ...partial,
  };
}

function slot(id: string, assignments: RosterView["slots"][number]["assignments"]) {
  return {
    id,
    roleLabel: "Voz",
    requiresCouple: false,
    sortOrder: 0,
    assignments,
  };
}

function assignment(
  id: string,
  personId: string,
  status: RosterView["slots"][number]["assignments"][number]["status"] = "CONFIRMED",
  partnerPersonId: string | null = null,
) {
  return {
    id,
    slotId: "s",
    personId,
    partnerPersonId,
    status,
    substituteForId: null,
  };
}

describe("escalas — contrato e permissão", () => {
  it("Meu Espaço pede a agenda do token e as frentes pedem um ministério", () => {
    expect(endpointsForSurface("membro")).toEqual(["/auth/me", "/rosters/me"]);
    expect(endpointsForSurface("louvor")).toEqual([
      "/auth/me",
      "/ministries",
      "/rosters/by-ministry",
    ]);
    expect(endpointsForSurface("atmosfera")).not.toContain("/rosters");
  });

  it("membro confirma a própria atribuição e não substitui nem confirma a de outra pessoa", () => {
    expect(canConfirmAssignment(["MEMBRO"], "p-membro", "p-membro")).toBe(true);
    expect(canConfirmAssignment(["MEMBRO"], "p-membro", "p-outra")).toBe(false);
    expect(canConfirmAssignment(["TESOURARIA"], "p-membro", "p-membro")).toBe(false);
    expect(canSubstituteAssignment(["MEMBRO"])).toBe(false);
    expect(canSubstituteAssignment(["LIDER_MINISTERIO"])).toBe(true);
    expect(canConfirmAssignment(["PASTOR"], "p-pastor", "p-outra")).toBe(true);
  });

  it("a sondagem de listagem distingue 403 de lista autorizada sem interpretar o corpo", () => {
    expect(interpretRosterProbe(403)).toBe("forbidden");
    expect(interpretRosterProbe(401)).toBe("forbidden");
    expect(interpretRosterProbe(200)).toBe("allowed");
    expect(interpretRosterProbe(500)).toBe("unavailable");
  });

  it("sinaliza as dependências que ainda não estão na main", () => {
    expect(BLOCKED_INTEGRATIONS.map((item) => item.issue)).toEqual([
      "#97",
      "#133",
      "#133",
      "#128",
      "#93",
    ]);
  });
});

describe("escalas — leitura estrita da API", () => {
  it("escolhe o slug formal e, na falta dele, o registro sintético já semeado", () => {
    const ministries = parseMinistryList({
      ministries: [
        { id: "m-demo", name: "Louvor (demo)", slug: "louvor-demo", scheduleText: null, leaderPersonId: null },
        { id: "m-jovens", name: "Jovens", slug: "jovens", scheduleText: "Sábado", leaderPersonId: "p1" },
      ],
    });
    expect(pickSurfaceMinistry(ministries, "louvor")?.id).toBe("m-demo");
    expect(pickSurfaceMinistry(ministries, "atmosfera")).toBeNull();
    const formal = parseMinistryList({
      ministries: [
        ...ministries,
        { id: "m-louvor", name: "Louvor", slug: "louvor", scheduleText: null, leaderPersonId: null },
      ],
    });
    expect(pickSurfaceMinistry(formal, "louvor")?.id).toBe("m-louvor");
  });

  it("não trata escala sem ministryId como se fosse Atmosfera ou Louvor", () => {
    const rosters = parseRosterList({
      rosters: [
        {
          id: "r-solta",
          ministryId: null,
          title: "Culto geral",
          serviceAt: AT,
          status: "DRAFT",
          slots: [],
        },
        {
          id: "r-louvor",
          ministryId: "m-demo",
          title: "Louvor domingo",
          serviceAt: AT,
          status: "DRAFT",
          slots: [],
        },
      ],
    });
    expect(rostersForMinistry(rosters, "m-demo").map((item) => item.id)).toEqual(["r-louvor"]);
  });

  it("recusa envelope incompleto em vez de mostrar lista vazia", () => {
    expect(() => parseRosterList({ items: [] })).toThrow(/lista de escalas/);
    expect(() => parseRosterList({ rosters: [{ id: "r1" }] })).toThrow(/Formato inesperado/);
    expect(() => parseMinistryList(null)).toThrow(/ministérios/);
  });
});

describe("escalas — bloqueio de pessoa no mesmo horário", () => {
  it("bloqueia a mesma pessoa em duas escalas PENDING ou CONFIRMED no mesmo instante", () => {
    const church = [
      roster({
        id: "r-louvor",
        title: "Louvor domingo",
        serviceAt: AT,
        slots: [slot("s1", [assignment("a1", "p-ana", "CONFIRMED")])],
      }),
      roster({
        id: "r-atmosfera",
        ministryId: "min-atmosfera",
        title: "Atmosfera domingo",
        serviceAt: "2026-11-15T21:00:00Z",
        slots: [slot("s2", [assignment("a2", "p-ana", "PENDING")])],
      }),
    ];
    const blocks = findSimultaneousBlocks(church);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.personId).toBe("p-ana");
    expect(blocks[0]?.internal).toBe(false);
    expect(otherRosterTitles(blocks[0]!, "r-louvor")).toEqual(["Atmosfera domingo"]);
    expect(blocksForRoster(blocks, "r-louvor")).toHaveLength(1);
  });

  it("bloqueia a pessoa repetida em duas funções da mesma escala", () => {
    const blocks = findSimultaneousBlocks([
      roster({
        id: "r1",
        title: "Ensaio que não é o contrato",
        serviceAt: AT,
        slots: [
          slot("s1", [assignment("a1", "p-ana")]),
          slot("s2", [assignment("a2", "p-ana", "PENDING")]),
        ],
      }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.internal).toBe(true);
    expect(otherRosterTitles(blocks[0]!, "r1")).toEqual([]);
  });

  it("considera o par e ignora recusa ou substituição", () => {
    const blocks = findSimultaneousBlocks([
      roster({
        id: "r1",
        title: "Culto A",
        serviceAt: AT,
        slots: [slot("s1", [assignment("a1", "p-ana", "CONFIRMED", "p-bruno")])],
      }),
      roster({
        id: "r2",
        title: "Culto B",
        serviceAt: AT,
        slots: [slot("s2", [
          assignment("a2", "p-bruno", "DECLINED"),
          assignment("a3", "p-carla", "SUBSTITUTED"),
          assignment("a4", "p-davi", "CONFIRMED", "p-ana"),
        ])],
      }),
      roster({
        id: "r3",
        title: "Culto depois",
        serviceAt: LATER,
        slots: [slot("s3", [assignment("a5", "p-ana", "CONFIRMED")])],
      }),
    ]);
    const people = blocks.map((block) => block.personId).sort();
    expect(people).toEqual(["p-ana"]);
    expect(blocks[0]?.assignmentIds.sort()).toEqual(["a1", "a4"]);
  });

  it("libera o horário depois que a atribuição anterior foi substituída", () => {
    const before = findSimultaneousBlocks([
      roster({
        id: "r1",
        title: "Culto",
        serviceAt: AT,
        slots: [slot("s1", [assignment("a1", "p-ana", "CONFIRMED")])],
      }),
      roster({
        id: "r2",
        title: "Outro culto",
        serviceAt: AT,
        slots: [slot("s2", [assignment("a2", "p-ana", "PENDING")])],
      }),
    ]);
    const after = findSimultaneousBlocks([
      roster({
        id: "r1",
        title: "Culto",
        serviceAt: AT,
        slots: [slot("s1", [assignment("a1", "p-ana", "SUBSTITUTED")])],
      }),
      roster({
        id: "r2",
        title: "Outro culto",
        serviceAt: AT,
        slots: [slot("s2", [assignment("a2", "p-bia", "PENDING")])],
      }),
    ]);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(0);
  });

  it("trata dois horários do mesmo dia em São Paulo como conflito e o dia seguinte como livre", () => {
    expect(churchDayKey(AT)).toBe(churchDayKey(LATER));
    const sameDay = findSameDayBlocks([
      roster({
        id: "r1",
        title: "Louvor",
        serviceAt: AT,
        slots: [slot("s1", [assignment("a1", "p-ana", "CONFIRMED")])],
      }),
      roster({
        id: "r2",
        ministryId: "min-atmosfera",
        title: "Atmosfera",
        serviceAt: LATER,
        slots: [slot("s2", [assignment("a2", "p-ana", "PENDING")])],
      }),
    ]);
    expect(findSimultaneousBlocks([
      roster({ id: "r1", title: "Louvor", serviceAt: AT, slots: [slot("s1", [assignment("a1", "p-ana")])]}),
      roster({ id: "r2", title: "Atmosfera", serviceAt: LATER, slots: [slot("s2", [assignment("a2", "p-ana", "PENDING")])]}),
    ])).toHaveLength(0);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0]?.internal).toBe(false);

    const nextDay = new Date(Date.parse(AT) + 24 * 60 * 60 * 1000).toISOString();
    expect(findSameDayBlocks([
      roster({ id: "r1", title: "Louvor", serviceAt: AT, slots: [slot("s1", [assignment("a1", "p-ana")])]}),
      roster({ id: "r3", title: "Dia seguinte", serviceAt: nextDay, slots: [slot("s3", [assignment("a3", "p-ana", "PENDING")])]}),
    ])).toHaveLength(0);
  });

  it("recusa agenda que não declara a pessoa do token", () => {
    expect(parseMyAgenda({
      personId: "per-membro",
      source: "jwt",
      assignments: [{
        id: "a1",
        status: "PENDING",
        participation: "assignee",
        roleLabel: "Voz",
        title: "Louvor domingo",
        serviceAt: AT,
        rosterStatus: "PUBLISHED",
        ministryName: "Louvor",
        ministrySlug: "louvor",
        sameDayConflict: false,
      }],
    }).assignments[0]?.title).toBe("Louvor domingo");
    expect(() => parseMyAgenda({ personId: "per-outra", assignments: [] })).toThrow(/token/);
  });
});
