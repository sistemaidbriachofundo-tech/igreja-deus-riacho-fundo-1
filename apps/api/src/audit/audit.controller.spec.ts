import "reflect-metadata";
import { ROLES_KEY } from "../auth/auth.constants";
import { AuditController } from "./audit.controller";

describe("AuditController roles", () => {
  it("does not add tesouraria or any other role to GET /audit-logs", () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      AuditController.prototype.list,
    ) as string[] | undefined;
    expect(roles).toEqual(["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"]);
  });

  it("keeps export on the same roles and exposes no mutation method", () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      AuditController.prototype.exportLogs,
    ) as string[] | undefined;
    expect(roles).toEqual(["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"]);
    const methods = Object.getOwnPropertyNames(AuditController.prototype);
    expect(
      methods.some((name) => /delete|update|remove|purge|patch/i.test(name)),
    ).toBe(false);
  });
});
