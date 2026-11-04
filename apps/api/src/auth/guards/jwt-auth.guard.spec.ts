import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { AuthUser } from "../types/auth-user";

describe("JwtAuthGuard", () => {
  const user: AuthUser = {
    userId: "u1",
    personId: "p1",
    email: "a@example.test",
    grants: [],
  };

  function ctx(auth?: string) {
    const request: { headers: { authorization?: string }; user?: AuthUser } = {
      headers: auth ? { authorization: auth } : {},
    };
    return {
      request,
      context: {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      },
    };
  }

  it("allows @Public routes", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      { verifyAccessToken: jest.fn() } as never,
    );
    expect(guard.canActivate(ctx().context as never)).toBe(true);
  });

  it("rejects missing bearer", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      { verifyAccessToken: jest.fn() } as never,
    );
    expect(() => guard.canActivate(ctx().context as never)).toThrow(
      UnauthorizedException,
    );
  });

  it("attaches user on valid token", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const authService = {
      verifyAccessToken: jest.fn().mockReturnValue(user),
    };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      authService as never,
    );
    const { context, request } = ctx("Bearer good.token");
    expect(guard.canActivate(context as never)).toBe(true);
    expect(request.user).toEqual(user);
  });

  it("rejects invalid token", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      {
        verifyAccessToken: jest.fn(() => {
          throw new Error("bad");
        }),
      } as never,
    );
    expect(() =>
      guard.canActivate(ctx("Bearer bad").context as never),
    ).toThrow(UnauthorizedException);
  });
});
