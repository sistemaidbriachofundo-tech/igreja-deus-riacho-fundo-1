import { ROLE_CODES } from "@idbrf/shared";
import { ROLES_KEY } from "../auth/auth.constants";
import { IndicatorsController } from "./indicators.controller";

describe("IndicatorsController — RBAC", () => {
  const proto = IndicatorsController.prototype;

  it("bloqueia convidado, membro e editor do site nos indicadores institucionais", () => {
    const summary = Reflect.getMetadata(ROLES_KEY, proto.summary) as string[];
    const membership = Reflect.getMetadata(ROLES_KEY, proto.membership) as string[];
    for (const roles of [summary, membership]) {
      expect(roles).not.toContain(ROLE_CODES.CONVIDADO);
      expect(roles).not.toContain(ROLE_CODES.MEMBRO);
      expect(roles).not.toContain(ROLE_CODES.EDITOR_SITE);
      expect(roles).toEqual(expect.arrayContaining([
        ROLE_CODES.PLATFORM_ADMIN,
        ROLE_CODES.SECRETARIA,
        ROLE_CODES.PASTOR,
        ROLE_CODES.TESOURARIA,
      ]));
    }
    expect(summary).toContain(ROLE_CODES.LIDER_MINISTERIO);
    expect(membership).not.toContain(ROLE_CODES.LIDER_MINISTERIO);
  });
});
