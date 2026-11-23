import "reflect-metadata";
import { ROLES_KEY } from "../auth/auth.constants";
import { OC_TEAM_ROLES } from "./service-order-planning.domain";
import { ServiceOrdersController } from "./service-orders.controller";

function rolesOf(method: keyof ServiceOrdersController): string[] {
  const handler = ServiceOrdersController.prototype[method];
  const roles = Reflect.getMetadata(ROLES_KEY, handler as object) as string[] | undefined;
  return roles ?? [];
}

describe("Ordem do Culto — tags não são RBAC", () => {
  const read = ["rules", "people", "preview", "list", "pdf", "get"] as const;
  const write = ["updateRules", "saveTeamMember", "generate", "create", "update", "approve", "publish", "revise"] as const;

  it("consulta pastor e administrador; escrita só do pastor", () => {
    for (const method of read) {
      expect(rolesOf(method).sort()).toEqual(["PASTOR", "PLATFORM_ADMIN"].sort());
    }
    for (const method of write) {
      expect(rolesOf(method)).toEqual(["PASTOR"]);
    }
  });

  it("membro, secretaria e líder não passam no guard, e nenhuma tag de culto vira papel", () => {
    for (const method of [...read, ...write]) {
      const roles = rolesOf(method);
      expect(roles).not.toEqual(expect.arrayContaining(["MEMBRO"]));
      expect(roles).not.toEqual(expect.arrayContaining(["SECRETARIA"]));
      expect(roles).not.toEqual(expect.arrayContaining(["LIDER_MINISTERIO"]));
      for (const tag of OC_TEAM_ROLES) expect(roles).not.toContain(tag);
    }
    expect(OC_TEAM_ROLES).toEqual(expect.arrayContaining(["pastor", "media", "preacher", "director"]));
  });
});
