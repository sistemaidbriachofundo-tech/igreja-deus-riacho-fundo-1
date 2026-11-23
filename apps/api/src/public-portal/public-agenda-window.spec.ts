import { PublicPortalController, eventIsCurrent } from "./public-portal.controller";

describe("agenda pública após o término", () => {
  const now = new Date("2026-11-23T15:00:00.000Z");
  const recent = "2026-11-13T15:00:00.000Z";
  const old = "2026-10-01T15:00:00.000Z";

  it("oculta o evento encerrado e o mantém quando a regra publicada permite", () => {
    expect(eventIsCurrent({ startsAt: recent, endsAt: recent }, +now, 0)).toBe(false);
    expect(eventIsCurrent({ startsAt: recent, endsAt: recent }, +now, 14)).toBe(true);
    expect(eventIsCurrent({ startsAt: old, endsAt: old }, +now, 14)).toBe(false);
  });

  it("aplica a regra vigente na listagem pública", async () => {
    const portal = {
      listEvents: async () => ({
        churchId: "riacho",
        events: [
          { id: "atual", startsAt: "2026-12-01T15:00:00.000Z", endsAt: null },
          { id: "recente", startsAt: recent, endsAt: recent },
          { id: "antigo", startsAt: old, endsAt: old },
        ],
      }),
    };
    const registrations = { openPublicRegistrationEvents: async () => new Set(["atual"]) };
    const hidden = new PublicPortalController(portal as never, {} as never, registrations as never);
    const shown = new PublicPortalController(
      portal as never,
      {} as never,
      registrations as never,
      { getAgendaKeepDays: async () => 14 } as never,
      { getPilotChurch: async () => ({ organizationId: "org", churchId: "riacho" }) } as never,
    );
    jest.useFakeTimers().setSystemTime(now);
    try {
      await expect(hidden.listEvents()).resolves.toMatchObject({ events: [{ id: "atual" }] });
      await expect(shown.listEvents()).resolves.toMatchObject({ events: [{ id: "atual" }, { id: "recente" }] });
    } finally {
      jest.useRealTimers();
    }
  });
});