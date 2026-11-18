import { describe, expect, it } from "vitest";
import { loadMinistryBoard, readScopedActivities, readScopedEscalas, rosterCapacitySummary, rosterPositionSummary } from "./ministry-presentation";

const token = "token-sintetico";
const base = "http://api.test";

function json(status: number, body: unknown) {
  return { status, text: async () => JSON.stringify(body) };
}

describe("escalas e atividades no escopo do ministério", () => {
  it("descarta escala e atividade de outro ministério", () => {
    expect(
      readScopedEscalas(
        {
          rosters: [
            {
              id: "esc-homens",
              ministryId: "min-homens",
              title: "Recepção de sábado",
              serviceAt: "2026-11-14T19:00:00.000Z",
              status: "PUBLISHED",
              slots: [
                {
                  id: "slot-recepcao",
                  roleLabel: "Recepção",
                  requiresCouple: true,
                  assignments: [
                    { id: "original", personId: "p1", status: "SUBSTITUTED", declinedAt: "2026-11-10T12:00:00.000Z" },
                    { id: "substituto", personId: "p2", partnerPersonId: "p3", status: "CONFIRMED", substituteForId: "original" },
                  ],
                },
                {
                  id: "slot-diaconia",
                  roleLabel: "Corredor",
                  requiredQualification: "diaconia",
                  assignments: [{ id: "recusa", personId: "p4", status: "DECLINED" }],
                },
              ],
            },
            {
              id: "esc-louvor",
              ministryId: "min-louvor",
              title: "Culto de louvor",
              serviceAt: "2026-11-15T19:00:00.000Z",
              status: "PUBLISHED",
              slots: [],
            },
          ],
        },
        "min-homens",
      ),
    ).toMatchObject([
      {
        id: "esc-homens",
        title: "Recepção de sábado",
        serviceAt: "2026-11-14T19:00:00.000Z",
        status: "PUBLISHED",
        functions: ["Recepção", "Corredor"],
        assignedCount: 2,
        positions: [
          { assignments: [
            { id: "original", status: "SUBSTITUTED", declinedAt: "2026-11-10T12:00:00.000Z" },
            { id: "substituto", status: "CONFIRMED", substituteForId: "original" },
          ] },
          { requiredQualification: "diaconia", assignments: [{ id: "recusa", status: "DECLINED" }] },
        ],
      },
    ]);

    expect(
      readScopedActivities(
        {
          events: [
            {
              id: "evt-homens",
              ministryId: "min-homens",
              name: "Café dos homens",
              startsAt: "2026-11-21T12:00:00.000Z",
              locationText: "Salão",
              status: "PUBLISHED",
            },
            {
              id: "evt-igreja",
              ministryId: null,
              name: "Culto da igreja",
              startsAt: "2026-11-22T19:00:00.000Z",
              status: "PUBLISHED",
            },
            {
              id: "evt-jovens",
              ministryId: "min-jovens",
              name: "Ensaio jovem",
              startsAt: "2026-11-20T19:00:00.000Z",
              status: "PUBLISHED",
            },
          ],
        },
        "min-homens",
      )?.map((item) => item.id),
    ).toEqual(["evt-homens"]);
  });

  it("contabiliza a posição pelo estado de quem está escalado", () => {
    const assignments = (status: "PENDING" | "CONFIRMED" | "DECLINED") => [{
      id: status, personId: "p1", partnerPersonId: "", personName: "", partnerName: "", status,
    }];
    expect(rosterPositionSummary([
      { id: "slot-1", label: "Portas", requiresCouple: false, assignments: assignments("PENDING") },
      { id: "slot-2", label: "Corredor", requiresCouple: false, assignments: assignments("DECLINED") },
      { id: "slot-3", label: "Setor 2", requiresCouple: false, assignments: assignments("CONFIRMED") },
    ])).toEqual({ open: 1, pending: 1, confirmed: 1 });
  });

  it("líder fora do ministério não pede escala nem atividade", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith("/ministries")) {
        return json(200, { ministries: [{ id: "min-homens", name: "Homens" }] });
      }
      return json(403, { code: "MINISTRY_SCOPE_FORBIDDEN", message: "Líder só visualiza dados do ministério autorizado." });
    };
    const board = await loadMinistryBoard({
      token,
      baseUrl: base,
      ministryId: "min-homens",
      fetchImpl,
    });
    expect(board.desk.kind).toBe("denied");
    expect(board.escalas.kind).toBe("hidden");
    expect(board.activities.kind).toBe("hidden");
    expect(calls.some((url) => url.includes("/rosters"))).toBe(false);
    expect(calls.some((url) => url.endsWith("/events"))).toBe(false);
  });

  it("usa os endpoints do ministério e diferencia caixa pendente de saldo zero", async () => {
    const calls: string[] = [];
    const event = { id: "evt", ministryId: "min-homens", name: "Encontro", startsAt: "2026-11-21T12:00:00.000Z" };
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith("/ministries")) return json(200, { ministries: [{ id: "min-homens", name: "Homens" }] });
      if (url.endsWith("/formal-memberships")) return json(200, { blocked: false, members: [] });
      if (url.endsWith("/agenda")) return json(200, { blocked: false, items: [event, { ...event, id: "outro", ministryId: "min-jovens" }] });
      if (url.endsWith("/requests")) return json(200, { blocked: false, requests: [{ id: "int", displayName: "Pessoa fictícia" }] });
      if (url.endsWith("/cost-center-balance")) return json(200, { currency: "BRL", configured: false, balanceCents: null });
      return json(200, { rosters: [] });
    };
    const board = await loadMinistryBoard({ token, baseUrl: base, fetchImpl });
    expect(board.activities).toMatchObject({ kind: "ready", items: [{ id: "evt" }] });
    expect(board.desk).toMatchObject({ kind: "ready", finance: { kind: "unconfigured" }, interests: [{ id: "int" }] });
    expect(calls.some(url => url.endsWith("/events") || url.includes("/volunteer-interests"))).toBe(false);
  });

  it("separa casais de vagas individuais e só conta um casal completo", () => {
    const assignment = { id: "a", personId: "joao", partnerPersonId: "", status: "PENDING" as const, personName: "João", partnerName: "" };
    expect(rosterCapacitySummary([
      { id: "single", label: "Recepção", requiresCouple: false, assignments: [assignment] },
      { id: "partial", label: "Ofertas", requiresCouple: true, assignments: [assignment] },
      { id: "pair", label: "Ofertas", requiresCouple: true, assignments: [{ ...assignment, partnerPersonId: "maria" }] },
    ])).toEqual({ single: 1, singleFilled: 1, couples: 2, couplesFilled: 1 });
  });

  it("ignora escalas gerais e de outro módulo para uma liderança de módulo", async () => {
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/ministries")) return json(200, { ministries: [{ id: "min", name: "Atmosfera", slug: "atmosfera" }] });
      if (url.endsWith("/formal-memberships")) return json(200, { blocked: false, members: [] });
      if (url.endsWith("/rosters/by-ministry/min")) return json(200, {
        ministryId: "min",
        permissions: { scope: "modules", manageModuleMemberships: true },
        modules: [{ id: "reception", name: "Recepção" }],
        rosters: [["correct", "reception"], ["unscoped"], ["other", "connection"]].map(([id, moduleId]) => ({
          id, ministryId: "min", moduleId, title: id, serviceAt: "2026-11-22T13:00:00Z", slots: [],
          capacity: [{ id: "individual", label: "Recepção", defaultCount: 3, count: 4, minimumCount: 1 }],
        })),
      });
      return json(403, {});
    };
    const board = await loadMinistryBoard({ token, baseUrl: base, fetchImpl });
    expect(board.escalas).toMatchObject({
      kind: "ready",
      permissions: { scope: "modules", manageModuleMemberships: true },
      items: [{ id: "correct", capacity: [{ id: "individual", count: 4 }] }],
    });
    if (board.escalas.kind !== "ready") throw new Error("Escalas indisponíveis");
    expect(board.escalas.items.map(item => item.id)).toEqual(["correct"]);
  });

  it("no ministério autorizado lê a escala pelo id e ignora saldo", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith("/ministries")) {
        return json(200, {
          ministries: [{ id: "min-homens", name: "Homens de Ação", slug: "homens", scheduleText: "Sábado, 16h" }],
        });
      }
      if (url.endsWith("/formal-memberships")) {
        return json(200, { blocked: false, members: [] });
      }
      if (url.endsWith("/agenda")) return json(501, { blocked: true, scheduleText: "Sábado, 16h", items: null });
      if (url.endsWith("/requests")) return json(501, { blocked: true, requests: null });
      if (url.endsWith("/cost-center-balance")) return json(501, { blocked: true, balance: 900 });
      if (url.includes("/volunteer-interests")) return json(200, { interests: [] });
      if (url.includes("/rosters/by-ministry/min-homens")) {
        return json(200, {
          rosters: [
            {
              id: "esc-homens",
              ministryId: "min-homens",
              title: "Recepção",
              serviceAt: "2026-11-14T19:00:00.000Z",
              status: "PUBLISHED",
              slots: [],
            },
          ],
        });
      }
      if (url.endsWith("/events")) {
        return json(200, {
          events: [{ id: "evt-homens", ministryId: "min-homens", name: "Café", startsAt: "2026-11-21T12:00:00.000Z", status: "PUBLISHED" }],
        });
      }
      return json(404, { message: url });
    };

    const board = await loadMinistryBoard({ token, baseUrl: base, fetchImpl });
    expect(board.desk.kind).toBe("ready");
    expect(board.escalas).toMatchObject({ kind: "ready", items: [{ id: "esc-homens" }] });
    expect(board.activities).toMatchObject({ kind: "ready", items: [{ id: "evt-homens" }] });
    expect(JSON.stringify(board)).not.toContain("900");
    expect(calls.some((url) => url.includes("/rosters/by-ministry/min-homens"))).toBe(true);
    expect(calls.some((url) => url.endsWith("/rosters"))).toBe(false);
  });
});
