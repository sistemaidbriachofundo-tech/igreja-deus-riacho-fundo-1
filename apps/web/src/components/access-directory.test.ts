import { describe, expect, it } from "vitest";
import { accessInviteRoles } from "./AccessDirectory";

describe("convite de administrador", () => {
  it("mantém o perfil administrativo fora do seletor sem capacidade confirmada", () => {
    expect(accessInviteRoles(false)).not.toContain("PLATFORM_ADMIN");
    expect(accessInviteRoles(false)).toContain("MEMBRO");
  });

  it("inclui administrador quando a API confirmar a capacidade", () => {
    expect(accessInviteRoles(true)).toContain("PLATFORM_ADMIN");
  });
});
