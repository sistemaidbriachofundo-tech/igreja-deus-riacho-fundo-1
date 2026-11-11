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

  it("allows @Public routes", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      { verifyAccessToken: jest.fn() } as never,
    );
    await expect(guard.canActivate(ctx().context as never)).resolves.toBe(true);
  });

  it("rejects missing bearer", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      { verifyAccessToken: jest.fn() } as never,
    );
    await expect(guard.canActivate(ctx().context as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("attaches user on valid token", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const authService = {
      verifyAccessToken: jest.fn().mockResolvedValue(user),
    };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      authService as never,
    );
    const { context, request } = ctx("Bearer good.token");
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toEqual(user);
  });

  it("rejects invalid token", async () => {
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
    await expect(
      guard.canActivate(ctx("Bearer bad").context as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
