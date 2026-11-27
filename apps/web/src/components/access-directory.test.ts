import { describe, expect, it } from "vitest";
import { accessInviteRoles } from "./AccessDirectory";

describe("convite de acesso à igreja", () => {
  it("permite os papéis da congregação e condiciona o perfil administrativo à autorização", () => {
    expect(accessInviteRoles(false)).toContain("SECRETARIA");
    expect(accessInviteRoles(false)).toContain("MEMBRO");
    expect(accessInviteRoles(false)).not.toContain("PLATFORM_ADMIN");
    expect(accessInviteRoles(true)).toContain("PLATFORM_ADMIN");
  });
});
