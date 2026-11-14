import type { Prisma } from "@prisma/client";
import { assertSlotEligibility, isModuleVolunteer, readModuleRules } from "./roster-operating-rules";

const slot = { requiresCouple: false, roster: { moduleId: "recepcao", ministryId: "atmosfera", churchId: "riacho" } };

describe("Equipe por módulo", () => {
  it("preserva equipes antigas e permite cadastrar uma pessoa sem casal", () => {
    expect(isModuleVolunteer(readModuleRules({}), "a")).toBe(true);
    const rules = readModuleRules({ volunteerIds: ["a", "a"], couples: [] });
    expect(rules.volunteerIds).toEqual(["a"]);
    expect(isModuleVolunteer(rules, "b")).toBe(false);
    expect(isModuleVolunteer(readModuleRules({ volunteerIds: [] }), "a")).toBe(false);
  });

  it("valida vínculos de casal e habilitação quando há equipe específica", () => {
    expect(() => readModuleRules({ volunteerIds: ["a"], couples: [["a", "b"]] })).toThrow();
    expect(() => readModuleRules({ volunteerIds: ["a"], qualifications: { diaconia: ["b"] } })).toThrow();
  });

  it("aceita voluntário individual ativo e rejeita pessoas fora da equipe ou inativas", async () => {
    const count = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const tx = {
      ministryRosterModule: { findFirst: jest.fn().mockResolvedValue({ rules: { volunteerIds: ["a"] } }) },
      ministryMembership: { count },
    } as unknown as Prisma.TransactionClient;
    await expect(assertSlotEligibility(tx, slot, ["a"])).resolves.toBeUndefined();
    await expect(assertSlotEligibility(tx, slot, ["b"])).rejects.toMatchObject({ response: { code: "ROSTER_MODULE_TEAM_REQUIRED" } });
    await expect(assertSlotEligibility(tx, slot, ["a"])).rejects.toMatchObject({ response: { code: "ROSTER_MODULE_TEAM_REQUIRED" } });
  });
});
