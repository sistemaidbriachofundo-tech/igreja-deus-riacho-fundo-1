import type { AuthUser } from "../auth/types/auth-user";
import { PersonalRosterService } from "./personal-roster.service";
import { RosterNoticesService } from "./roster-notices.service";

const scope = { organizationId: "igreja", churchId: "riacho" };
const actor = { userId: "u1", personId: "p1", email: "p1@example.test", grants: [] } as AuthUser;

describe("pesquisa de escala segue o dia publicado", () => {
  it("abre a resposta no dia configurado e mantém o padrão no dia 25", async () => {
    const prisma = {
      ministryMembership: { findMany: async () => [] },
      roster: { findMany: async () => [] },
      rosterAvailabilityResponse: { findUnique: async () => null },
    };
    const pilot = { getPilotChurch: async () => scope };
    const withDay = new PersonalRosterService(prisma as never, pilot as never, { getSurveyOpenDay: async () => 24 } as never);
    const standard = new PersonalRosterService(prisma as never, pilot as never);
    const day = new Date("2026-11-24T15:00:00.000Z");
    await expect(withDay.monthlySurvey(actor, day)).resolves.toMatchObject({ open: true, month: "2026-12" });
    await expect(standard.monthlySurvey(actor, day)).resolves.toMatchObject({ open: false });
  });

  it("dispara o aviso da pesquisa somente no dia vigente", async () => {
    const writes: string[] = [];
    const db = {
      rosterNotice: { findMany: async () => [], createMany: async ({ data }: { data: Array<{ id: string }> }) => { writes.push(...data.map(item => item.id)); return { count: data.length }; } },
      roster: { findMany: async () => [{ ministryId: "m", moduleId: null, module: { rules: {} } }] },
      ministryMembership: { findMany: async () => [{ personId: "p1", ministryId: "m" }] },
      rosterAssignment: { findMany: async () => [] },
    };
    const service = new RosterNoticesService(db as never, { getPilotChurch: async () => scope } as never, undefined, { getSurveyOpenDay: async () => 24 } as never);
    await service.run(new Date("2026-11-25T15:00:00.000Z"));
    expect(writes.some(id => id.startsWith("survey:"))).toBe(false);
    await service.run(new Date("2026-11-24T15:00:00.000Z"));
    expect(writes).toContain("survey:riacho:2026-12:p1");
  });
});
