import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLE_CODES } from "@idbrf/shared";
import { ScopeGuard } from "./scope.guard";
import type { AuthUser } from "../types/auth-user";

describe("ScopeGuard", () => {
  it("allows when no scope metadata", () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new ScopeGuard(reflector);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as never;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("allows grant matching org/church", () => {
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === "scope") {
          return {
            organizationIdParam: "organizationId",
            churchIdParam: "churchId",
          };
        }
        if (key === "roles") {
          return [ROLE_CODES.SECRETARIA];
        }
        return undefined;
      },
    } as unknown as Reflector;
    const guard = new ScopeGuard(reflector);
    const user: AuthUser = {
      userId: "u1",
      personId: "demoPersonRiacho01",
      email: "a@test",
      grants: [
        {
          roleCode: ROLE_CODES.SECRETARIA,
          organizationId: "org1",
          churchId: "ch1",
        },
      ],
    };
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { organizationId: "org1", churchId: "ch1" },
        }),
      }),
    } as never;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("forbids other church", () => {
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === "scope") {
          return { organizationIdParam: "organizationId", churchIdParam: "churchId" };
        }
        if (key === "roles") {
          return [ROLE_CODES.SECRETARIA];
        }
        return undefined;
      },
    } as unknown as Reflector;
    const guard = new ScopeGuard(reflector);
    const user: AuthUser = {
      userId: "u1",
      personId: "demoPersonRiacho01",
      email: "a@test",
      grants: [
        {
          roleCode: ROLE_CODES.SECRETARIA,
          organizationId: "org1",
          churchId: "ch1",
        },
      ],
    };
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { organizationId: "org1", churchId: "ch2" },
        }),
      }),
    } as never;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
