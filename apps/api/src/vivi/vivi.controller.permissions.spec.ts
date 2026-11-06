import { ROLE_CODES } from "@idbrf/shared";
import { ROLES_KEY } from "../auth/auth.constants";
import { ViviController } from "./vivi.controller";

describe("Vivi editorial authorization", () => {
  it("permits website editors and publishers to use the existing authenticated assistant", () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ViviController.prototype.chatAdmin) as string[];
    expect(roles).toEqual(expect.arrayContaining([
      ROLE_CODES.EDITOR_SITE,
      ROLE_CODES.PUBLICADOR_SITE,
      ROLE_CODES.SECRETARIA,
      ROLE_CODES.PASTOR,
      ROLE_CODES.PLATFORM_ADMIN,
    ]));
    expect(roles).not.toContain(ROLE_CODES.MEMBRO);
  });
});
