import { MinistryScopeController } from "./ministry-scope.controller";
import type { AuthUser } from "../../auth/types/auth-user";

describe("MinistryScopeController", () => {
  const user: AuthUser = {
    userId: "usr-lider-homens",
    personId: "per-lider-homens",
    email: "lider.homens.sintetico@example.test",
    grants: [],
  };

  it("encaminha o escopo sem montar integrante", async () => {
    const gate = {
      readMemberships: jest.fn().mockRejectedValue(new Error("501")),
      admit: jest.fn().mockRejectedValue(new Error("501")),
      convertInterest: jest.fn().mockRejectedValue(new Error("501")),
      endMembership: jest.fn().mockRejectedValue(new Error("501")),
      readAgenda: jest.fn().mockRejectedValue(new Error("501")),
      readRequests: jest.fn().mockRejectedValue(new Error("501")),
      readCostCenterBalance: jest.fn().mockRejectedValue(new Error("501")),
    };
    const controller = new MinistryScopeController(gate as never);

    await expect(controller.memberships(user, "min-homens")).rejects.toThrow(
      "501",
    );
    await expect(
      controller.admit(user, "min-homens", {
        personId: "per-sint-01",
        role: "INTEGRANTE",
      }),
    ).rejects.toThrow("501");
    await expect(
      controller.convert(user, "min-mulheres", {
        volunteerInterestId: "int-sint-01",
      }),
    ).rejects.toThrow("501");
    await expect(controller.end(user, "min-homens", "mmb-sint-01")).rejects.toThrow(
      "501",
    );
    await expect(controller.agenda(user, "min-homens")).rejects.toThrow("501");
    await expect(controller.requests(user, "min-homens")).rejects.toThrow(
      "501",
    );
    await expect(controller.balance(user, "min-homens")).rejects.toThrow("501");

    expect(gate.readMemberships).toHaveBeenCalledWith(user, "min-homens");
    expect(gate.admit).toHaveBeenCalledWith(
      user,
      "min-homens",
      "per-sint-01",
      "INTEGRANTE",
    );
    expect(gate.endMembership).toHaveBeenCalledWith(user, "min-homens", "mmb-sint-01");
    expect(gate.convertInterest).toHaveBeenCalledWith(
      user,
      "min-mulheres",
      "int-sint-01",
    );
    expect(gate.readCostCenterBalance).toHaveBeenCalledWith(user, "min-homens");
  });
});
