import { describe, expect, it } from "vitest";
import { loadMinistryBoard, readScopedActivities, readScopedEscalas } from "./ministry-presentation";

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
                  roleLabel: "Recepção",
                  assignments: [{ status: "CONFIRMED" }, { status: "DECLINED" }],
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
    ).toEqual([
      {
        id: "esc-homens",
        title: "Recepção de sábado",
        serviceAt: "2026-11-14T19:00:00.000Z",
        status: "PUBLISHED",
        functions: ["Recepção"],
        assignedCount: 1,
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
