import { canManageConnection } from "./connection-access";
import type { AuthUser } from "../auth/types/auth-user";

const scope = { organizationId: "org", churchId: "church" };
const base = { userId: "user", personId: "person", email: "pessoa@example.test", ...scope };

describe("escopo da Conexão", () => {
  const db = { ministry: { findFirst: jest.fn().mockResolvedValue({ id: "connection", leaderPersonId: base.personId }) } };
  const check = (grants: AuthUser["grants"], churchId = scope.churchId) =>
    canManageConnection(db as never, { ...base, churchId, grants }, scope);

  it("autoriza administração, pastor e liderança do ministério de Conexão", async () => {
    await expect(check([{ ...scope, roleCode: "PLATFORM_ADMIN" }])).resolves.toBe(true);
    await expect(check([{ ...scope, roleCode: "PASTOR" }])).resolves.toBe(true);
    await expect(check([{ ...scope, roleCode: "LIDER_MINISTERIO", ministryId: "connection" }])).resolves.toBe(true);
  });

  it("nega Secretaria, liderança de outro ministério e troca de congregação", async () => {
    await expect(check([{ ...scope, roleCode: "SECRETARIA" }])).resolves.toBe(false);
    await expect(check([{ ...scope, roleCode: "LIDER_MINISTERIO", ministryId: "other" }])).resolves.toBe(false);
    await expect(check([{ ...scope, roleCode: "PASTOR" }], "outra-igreja")).resolves.toBe(false);
  });
});
