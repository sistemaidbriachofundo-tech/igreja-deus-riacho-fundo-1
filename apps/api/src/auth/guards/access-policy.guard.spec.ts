import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ACCESS_POLICY_MODE_ENV, ROLE_CODES } from "@idbrf/shared";
import { AccessPolicyGuard } from "./access-policy.guard";
import type { AuthUser } from "../types/auth-user";

function actor(
  roleCode: string,
  extra: Partial<AuthUser["grants"][number]> = {},
  personId = "p-actor",
): AuthUser {
  return {
    userId: "u1",
    personId,
    email: "pessoa@example.test",
    organizationId: "org1",
    churchId: extra.churchId === undefined ? "ch1" : extra.churchId,
    grants: [
      {
        roleCode,
        organizationId: "org1",
        churchId: "ch1",
        ...extra,
      },
    ],
  };
}

function activate(
  method: string,
  path: string,
  user?: AuthUser,
  options?: { isPublic?: boolean },
) {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === "isPublic") return options?.isPublic ?? false;
      return undefined;
    },
  } as unknown as Reflector;
  const guard = new AccessPolicyGuard(reflector);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        path,
        user,
        params: {},
        query: {},
      }),
    }),
  } as never;
  return () => guard.canActivate(context);
}

function statusOf(run: () => boolean): number {
  try {
    run();
    return 200;
  } catch (error) {
    if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
      return error.getStatus();
    }
    throw error;
  }
}

describe("AccessPolicyGuard", () => {
  const previous = process.env[ACCESS_POLICY_MODE_ENV];

  beforeEach(() => {
    delete process.env[ACCESS_POLICY_MODE_ENV];
  });

  afterAll(() => {
    if (previous === undefined) {
      delete process.env[ACCESS_POLICY_MODE_ENV];
    } else {
      process.env[ACCESS_POLICY_MODE_ENV] = previous;
    }
  });

  it("401 sem sessão nas rotas classificadas e 200 em rota fora da matriz", () => {
    expect(statusOf(activate("GET", "/ledger/accounts"))).toBe(401);
    expect(statusOf(activate("GET", "/pastoral-cases"))).toBe(401);
    expect(statusOf(activate("GET", "/health"))).toBe(200);
    expect(
      statusOf(activate("GET", "/pastoral-cases", undefined, { isPublic: true })),
    ).toBe(200);
  });

  it.each([
    ["PLATFORM_ADMIN", "GET", "/pastoral-cases", 403],
    ["PLATFORM_ADMIN", "GET", "/ledger/accounts", 403],
    ["PLATFORM_ADMIN", "POST", "/pastoral-cases", 403],
    ["PLATFORM_ADMIN", "GET", "/auth/oidc/config", 200],
    ["PLATFORM_ADMIN", "GET", "/persons/search", 200],
    ["PLATFORM_ADMIN", "GET", "/audit-logs", 200],
    ["SECRETARIA", "GET", "/audit-logs", 200],
    ["EDITOR_SITE", "GET", "/audit-logs", 403],
    ["EDITOR_SITE", "GET", "/persons/search", 403],
    ["EDITOR_SITE", "GET", "/persons/p-other", 403],
    ["EDITOR_SITE", "GET", "/pastoral-cases", 403],
    ["EDITOR_SITE", "GET", "/ledger/accounts", 403],
    ["EDITOR_SITE", "GET", "/ministries", 403],
    ["EDITOR_SITE", "GET", "/cms/site-layout", 200],
    ["EDITOR_SITE", "PATCH", "/cms/site-layout/draft", 200],
    ["EDITOR_SITE", "POST", "/cms/site-layout/publish", 403],
    ["PUBLICADOR_SITE", "POST", "/cms/site-layout/publish", 200],
    ["PUBLICADOR_SITE", "GET", "/persons/search", 403],
    ["SECRETARIA", "GET", "/persons/search", 200],
    ["SECRETARIA", "GET", "/persons/p-other", 200],
    ["SECRETARIA", "PATCH", "/persons/p-other", 200],
    ["SECRETARIA", "GET", "/pastoral-cases", 403],
    ["SECRETARIA", "GET", "/ledger/accounts", 403],
    ["SECRETARIA", "POST", "/ministries", 200],
    ["SECRETARIA", "GET", "/auth/oidc/config", 403],
    ["PASTOR", "GET", "/pastoral-cases", 200],
    ["PASTOR", "POST", "/pastoral-cases", 200],
    ["PASTOR", "GET", "/ledger/entries", 403],
    ["PASTOR", "GET", "/persons/search", 200],
    ["PASTOR", "PATCH", "/persons/p-other", 403],
    ["TESOURARIA", "GET", "/ledger/accounts", 200],
    ["TESOURARIA", "POST", "/ledger/entries", 200],
    ["TESOURARIA", "GET", "/persons/search", 403],
    ["TESOURARIA", "GET", "/pastoral-cases", 403],
    ["TESOURARIA", "GET", "/cms/contents", 403],
    ["LIDER_MINISTERIO", "GET", "/ministries", 200],
    ["LIDER_MINISTERIO", "POST", "/ministries", 403],
    ["LIDER_MINISTERIO", "GET", "/persons/search", 403],
    ["LIDER_MINISTERIO", "GET", "/ledger/accounts", 403],
    ["LIDER_MINISTERIO", "GET", "/pastoral-cases", 403],
    ["MEMBRO", "GET", "/pastoral-cases", 403],
    ["MEMBRO", "GET", "/ledger/accounts", 403],
    ["MEMBRO", "GET", "/persons/search", 403],
    ["MEMBRO", "POST", "/assignments/a1/confirm", 200],
    ["MEMBRO", "POST", "/assignments/a1/substitute", 403],
    ["MEMBRO", "GET", "/cms/site-layout", 403],
  ] as const)("%s %s %s → %s", (role, method, path, expected) => {
    expect(statusOf(activate(method, path, actor(role)))).toBe(expected);
  });

  it("membro lê a própria ficha e recebe 403 na ficha de outra pessoa", () => {
    expect(
      statusOf(activate("GET", "/persons/p-actor/dossier", actor(ROLE_CODES.MEMBRO))),
    ).toBe(200);
    expect(
      statusOf(activate("GET", "/persons/p-other", actor(ROLE_CODES.MEMBRO))),
    ).toBe(403);
  });

  it("líder altera o próprio ministério e recebe 403 no ministério vizinho", () => {
    const own = actor(ROLE_CODES.LIDER_MINISTERIO, { ministryId: "min-jovens" });
    expect(statusOf(activate("PATCH", "/ministries/min-jovens", own))).toBe(200);
    expect(statusOf(activate("PATCH", "/ministries/min-homens", own))).toBe(403);
  });

  it("tesouraria de outra congregação recebe 403 no ledger", () => {
    const foreign = actor(ROLE_CODES.TESOURARIA, { churchId: "ch2" });
    foreign.churchId = "ch1";
    expect(statusOf(activate("GET", "/ledger/accounts", foreign))).toBe(403);
  });

  it("admin com grant de tesouraria lê o ledger e continua sem pastoral", () => {
    const user = actor(ROLE_CODES.PLATFORM_ADMIN, { churchId: null });
    user.grants.push({
      roleCode: ROLE_CODES.TESOURARIA,
      organizationId: "org1",
      churchId: "ch1",
    });
    expect(statusOf(activate("GET", "/ledger/accounts", user))).toBe(200);
    expect(statusOf(activate("GET", "/pastoral-cases", user))).toBe(403);
  });

  it("legacy desliga o guard HTTP", () => {
    process.env[ACCESS_POLICY_MODE_ENV] = "legacy";
    expect(
      statusOf(activate("GET", "/persons/search", actor(ROLE_CODES.EDITOR_SITE))),
    ).toBe(200);
  });
});
