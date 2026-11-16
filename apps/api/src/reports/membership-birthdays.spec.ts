import { ForbiddenException } from "@nestjs/common";
import { MembershipInsightsService } from "./membership-insights.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("Consulta de aniversariantes", () => {
  const actor = { grants: [{ roleCode: "PASTOR", organizationId: "org", churchId: "church" }] } as AuthUser;
  const date = (value: string) => new Date(value + "T00:00:00Z");
  const adult = { id: "p1", displayName: "Pessoa adulta", birthDate: date("1990-11-14"), isMinor: false,
    phone: "(61) 99999-0000", legalGuardian: null, communicationConsents: [] };
  const guardian = { organizationId: "org", homeChurchId: "church", status: "ACTIVE", phone: "(61) 99999-0001",
    isMinor: false, birthDate: date("1990-05-14"), memberships: [], communicationConsents: [] };
  const findMany = jest.fn();
  const service = new MembershipInsightsService({ person: { findMany } } as never,
    { getPilotChurch: async () => ({ organizationId: "org", churchId: "church" }) } as never);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-15T01:00:00Z"));
    findMany.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it("restringe a lista e o contato à congregação e respeita a preferência do destinatário", async () => {
    findMany.mockResolvedValue([
      adult,
      { ...adult, id: "p2", birthDate: date("2014-11-14"), displayName: "Pessoa menor", legalGuardian: guardian },
      { ...adult, id: "p3", legalGuardian: null, communicationConsents: [{ whatsappOptIn: false, revokedAt: null }] },
      { ...adult, id: "p4", birthDate: date("2014-11-14"), legalGuardian: { ...guardian, homeChurchId: "outra" } },
      { ...adult, id: "p5", phone: "inválido" },
    ]);
    const { birthdays } = await service.birthdays(actor);
    expect(resultById(birthdays)).toMatchObject({
      p1: { date: "2026-11-14", phone: "+5561999990000", contactKind: "PERSON" },
      p2: { phone: "+5561999990001", contactKind: "GUARDIAN" },
      p3: { phone: null, contactBlocked: true },
      p4: { phone: null },
      p5: { phone: null },
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org", status: "ACTIVE" }) }));
    await expect(service.birthdays({ ...actor, grants: [{ ...actor.grants[0], churchId: "outra" }] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("usa o mês civil completo e mantém a semana limitada aos sete dias a partir de hoje", async () => {
    findMany.mockResolvedValue([adult, { ...adult, id: "anterior", birthDate: date("1990-11-02") },
      { ...adult, id: "fim", birthDate: date("1990-11-30") }]);
    expect((await service.birthdays(actor, "month")).birthdays.map(row => row.id)).toEqual(["anterior", "p1", "fim"]);
    expect((await service.birthdays(actor, "week")).birthdays.map(row => row.id)).toEqual(["p1"]);
  });
});

function resultById<T extends { id: string }>(rows: T[]) {
  return Object.fromEntries(rows.map(row => [row.id, row]));
}
