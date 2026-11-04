import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLE_CODES } from "@idbrf/shared";
import { RolesGuard } from "./roles.guard";
import type { AuthUser } from "../types/auth-user";

function mockContext(user?: AuthUser) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as never;
}

describe("RolesGuard", () => {
  it("allows when no roles metadata", () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it("allows matching role", () => {
    const reflector = {
      getAllAndOverride: () => [ROLE_CODES.SECRETARIA],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const user: AuthUser = {
      userId: "u1",
      personId: "demoPersonRiacho01",
      email: "a@test",
      grants: [{ roleCode: ROLE_CODES.SECRETARIA, organizationId: "o1" }],
    };
    expect(guard.canActivate(mockContext(user))).toBe(true);
  });

  it("forbids missing role", () => {
    const reflector = {
      getAllAndOverride: () => [ROLE_CODES.TESOURARIA],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const user: AuthUser = {
      userId: "u1",
      personId: "demoPersonRiacho01",
      email: "a@test",
      grants: [{ roleCode: ROLE_CODES.MEMBRO, organizationId: "o1" }],
    };
    expect(() => guard.canActivate(mockContext(user))).toThrow(
      ForbiddenException,
    );
  });
});
