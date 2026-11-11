import {
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { hashPassword, AuthService, type LoginResult, type SessionToken } from "./auth.service";
import { encryptTotpSecret } from "./mfa/mfa-crypto.util";
import { currentTotpCode } from "./mfa/totp.util";
import { InMemoryAuthAttemptLimiter } from "./login/auth-attempt-limiter";
import { InMemoryMfaChallengeStore } from "./mfa/mfa-challenge.store";
import { AuthClock } from "./session/auth-clock";
import { authzVersion } from "./session/authz-version";
import {
  InMemorySessionStore,
  type SessionStore,
} from "./session/session-store";

const PASSWORD = "senha-sintetica-1";
const EMAIL = "pastor.sintetico@example.test";
const PERSON = "demoPersonRiacho01";

class MutableClock extends AuthClock {
  current = Date.now();
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

function httpBody(error: unknown): { status: number; code: string; message: string } {
  const http = error as {
    getStatus?: () => number;
    getResponse?: () => { code?: string; message?: string | string[] };
    message?: string;
  };
  const body = http.getResponse?.() ?? {};
  const raw = typeof body === "object" && body && "message" in body ? body.message : http.message;
  return {
    status: http.getStatus?.() ?? 0,
    code: typeof body === "object" && body && "code" in body ? String(body.code) : "",
    message: Array.isArray(raw) ? raw.join(" ") : String(raw ?? ""),
  };
}

interface Factor {
  id: string;
  status: string;
  secretCiphertext: string | null;
}

interface UserRecord {
  id: string;
  personId: string;
  email: string;
  passwordHash: string;
  status: string;
  mfaRequired: boolean;
  grants: Array<{
    organizationId: string | null;
    churchId: string | null;
    ministryId: string | null;
    role: { code: string };
  }>;
}

function harness(user: UserRecord, factor: Factor | null = null, clock: AuthClock = new AuthClock()) {
  let current = factor;
  const audits: unknown[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email && where.email !== user.email) return null;
        if (where.id && where.id !== user.id) return null;
        return { ...user, mfaFactors: current ? [{ ...current }] : [] };
      }),
    },
    userMfaFactor: {
      create: jest.fn(async ({ data }: { data: { status: string; secretCiphertext: string; label?: string } }) => {
        current = { id: "factor-1", status: data.status, secretCiphertext: data.secretCiphertext };
        return { ...current };
      }),
      update: jest.fn(async ({ data }: { data: { status?: string; secretCiphertext?: string | null } }) => {
        current = {
          id: current?.id ?? "factor-1",
          status: data.status ?? current?.status ?? "DISABLED",
          secretCiphertext:
            data.secretCiphertext === undefined ? current?.secretCiphertext ?? null : data.secretCiphertext,
        };
        return { ...current, verifiedAt: new Date() };
      }),
    },
    church: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === "ch2") return { id: "ch2", organizationId: "org1" };
        if (where.id === "ch-other") return { id: "ch-other", organizationId: "org-other" };
        return null;
      }),
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: unknown }) => {
        audits.push(data);
        return data;
      }),
    },
  };
  const pilot = {
    getPilotChurch: jest.fn().mockResolvedValue({
      organizationId: "org1",
      churchId: "ch1",
      organizationSlug: "igreja-de-deus",
      churchSlug: "riacho-fundo-1",
      churchName: "RF1",
    }),
  };
  const sessions = new InMemorySessionStore(clock);
  const challenges = new InMemoryMfaChallengeStore(clock);
  const attempts = new InMemoryAuthAttemptLimiter(clock);
  const service = new AuthService(
    prisma as never,
    pilot as never,
    sessions,
    challenges,
    attempts,
    clock,
  );
  return { service, prisma, audits, sessions, user };
}

function asChallenge(result: LoginResult) {
  if ("accessToken" in result) {
    throw new Error("JWT emitido antes do MFA");
  }
  return result;
}

function challengeIdOf(result: LoginResult): string {
  return asChallenge(result).mfa.challengeId;
}

function sessionOf(result: LoginResult): SessionToken {
  if (!("accessToken" in result)) {
    throw new Error("sessão não emitida");
  }
  return result;
}

describe("F1.1-A segurança de login, MFA e sessão", () => {
  let passwordHash = "";
  const logs: jest.SpyInstance[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = "unit-test-jwt-secret-32chars-ok!!";
    process.env.NODE_ENV = "test";
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      logs.push(jest.spyOn(console, method).mockImplementation(() => undefined));
    }
  });

  afterEach(() => {
    delete process.env.AUTH_LOGIN_FAILURE_LIMIT;
    delete process.env.AUTHZ_POLICY_VERSION;
    for (const spy of logs.splice(0)) {
      const text = JSON.stringify(spy.mock.calls);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain("otpauth:");
      spy.mockRestore();
    }
  });

  function baseUser(role: string, extra: Partial<UserRecord> = {}): UserRecord {
    return {
      id: "user-sintetico",
      personId: PERSON,
      email: EMAIL,
      passwordHash,
      status: "ACTIVE",
      mfaRequired: false,
      grants: [
        { organizationId: "org1", churchId: "ch1", ministryId: null, role: { code: role } },
      ],
      ...extra,
    };
  }

  function assertAuditClean(audits: unknown[], token?: string) {
    const text = JSON.stringify(audits);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain("otpauth:");
    expect(text.toLowerCase()).not.toContain("bearer ");
    if (token) {
      expect(text).not.toContain(token);
    }
  }

  it("usa a mesma mensagem pública para senha errada, usuário inexistente e inativo", async () => {
    const { service, audits, user } = harness(baseUser("MEMBRO"));
    const wrong = await service.login({ email: EMAIL, password: "outra-senha-errada" }).catch((error) => error);
    const missing = await service.login({ email: "ninguem@example.test", password: PASSWORD }).catch((error) => error);
    user.status = "DISABLED";
    const inactive = await service.login({ email: EMAIL, password: PASSWORD }).catch((error) => error);
    const errors = [wrong, missing, inactive];
    const bodies = errors.map(httpBody);
    expect(new Set(bodies.map((body) => body.message))).toEqual(new Set(["Credenciais inválidas"]));
    expect(bodies.every((body) => body.status === 401 && body.code === "INVALID_CREDENTIALS")).toBe(true);
    expect(JSON.stringify(bodies)).not.toContain(EMAIL);
    assertAuditClean(audits);
    const reasons = audits.map((row) => (row as { metadata: { reason: string } }).metadata.reason);
    expect(reasons).toEqual(expect.arrayContaining(["invalid_password", "invalid_user", "inactive_user"]));
  });

  it.each([
    "PLATFORM_ADMIN",
    "SECRETARIA",
    "PASTOR",
    "TESOURARIA",
    "LIDER_MINISTERIO",
    "EDITOR_SITE",
    "PUBLICADOR_SITE",
    "FUTURO_PRIVILEGIO",
  ])("não emite JWT para %s antes do segundo fator", async (role) => {
    const { service, audits } = harness(baseUser(role));
    const result = await service.login({ email: EMAIL, password: PASSWORD });
    expect(result).not.toHaveProperty("accessToken");
    expect(result.mfa.required).toBe(true);
    expect(result.mfa.enrollmentRequired).toBe(true);
    expect(challengeIdOf(result).length).toBeGreaterThan(20);
    assertAuditClean(audits);
    expect(JSON.stringify(audits)).not.toContain(challengeIdOf(result));
  });

  it("exige MFA quando o papel comum está combinado com um privilegiado", async () => {
    const user = baseUser("MEMBRO");
    user.grants.push({
      organizationId: "org1",
      churchId: "ch1",
      ministryId: null,
      role: { code: "SECRETARIA" },
    });
    const { service } = harness(user);
    const result = await service.login({ email: EMAIL, password: PASSWORD });
    expect(result).not.toHaveProperty("accessToken");
    expect(result.mfa.enrollmentRequired).toBe(true);
  });

  it("emite sessão para papel comum sem MFA e respeita a flag mfaRequired", async () => {
    const open = harness(baseUser("MEMBRO"));
    const member = sessionOf(await open.service.login({ email: EMAIL, password: PASSWORD }));
    expect(member.accessToken).toBeTruthy();
    expect(member.mfa.challengeRequired).toBe(false);
    const verified = await open.service.verifyAccessToken(member.accessToken);
    expect(verified.grants[0]?.roleCode).toBe("MEMBRO");
    expect(verified.sessionId).toBeTruthy();

    const flagged = harness(baseUser("MEMBRO", { mfaRequired: true }));
    const challenged = await flagged.service.login({ email: EMAIL, password: PASSWORD });
    expect(challenged).not.toHaveProperty("accessToken");
    expect(challenged.mfa.required).toBe(true);
  });

  it("completa enrollment, recusa código incorreto e bloqueia replay", async () => {
    const { service, audits } = harness(baseUser("TESOURARIA"));
    const pending = await service.login({ email: EMAIL, password: PASSWORD });
    expect(pending.mfa.enrollmentRequired).toBe(true);
    const started = await service.beginMfaEnrollment({ challengeId: challengeIdOf(pending) });
    expect(started.otpauthUri.startsWith("otpauth://")).toBe(true);
    const bad = currentTotpCode(started.secret) === "000000" ? "111111" : "000000";
    await expect(
      service.confirmMfaEnrollment({ challengeId: challengeIdOf(pending), code: bad }),
    ).rejects.toMatchObject({ message: "Não foi possível concluir a verificação" });
    const session = await service.confirmMfaEnrollment({
      challengeId: challengeIdOf(pending),
      code: currentTotpCode(started.secret),
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.mfa.required).toBe(true);
    const replay = await service
      .confirmMfaEnrollment({
        challengeId: challengeIdOf(pending),
        code: currentTotpCode(started.secret),
      })
      .catch((error) => error);
    expect(httpBody(replay)).toMatchObject({ status: 401, code: "MFA_REPLAY" });
    assertAuditClean(audits, session.accessToken);
    expect(JSON.stringify(audits)).not.toContain(started.secret);
    expect(JSON.stringify(audits)).not.toContain(started.otpauthUri);
  });

  it("aceita TOTP correto, recusa o incorreto, o replay e o desafio expirado", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const clock = new MutableClock();
    const { service, audits } = harness(
      baseUser("PASTOR"),
      { id: "factor-1", status: "ENABLED", secretCiphertext: encryptTotpSecret(secret) },
      clock,
    );
    const pending = await service.login({ email: EMAIL, password: PASSWORD });
    expect(pending.mfa.challengeRequired).toBe(true);
    expect(pending).not.toHaveProperty("accessToken");
    const bad = currentTotpCode(secret, clock.now()) === "000000" ? "111111" : "000000";
    const wrong = await service
      .verifyMfaChallenge({ challengeId: challengeIdOf(pending), code: bad })
      .catch((error) => error);
    expect(httpBody(wrong)).toMatchObject({
      status: 401,
      code: "MFA_INVALID",
      message: "Não foi possível concluir a verificação",
    });
    const session = await service.verifyMfaChallenge({
      challengeId: challengeIdOf(pending),
      code: currentTotpCode(secret, clock.now()),
    });
    expect(session.user.grants[0]?.roleCode).toBe("PASTOR");
    const replay = await service
      .verifyMfaChallenge({
        challengeId: challengeIdOf(pending),
        code: currentTotpCode(secret, clock.now()),
      })
      .catch((error) => error);
    expect(httpBody(replay).code).toBe("MFA_REPLAY");

    const expiredLogin = await service.login({ email: EMAIL, password: PASSWORD });
    clock.advance(5 * 60 * 1000 + 1000);
    const expired = await service
      .verifyMfaChallenge({
        challengeId: challengeIdOf(expiredLogin),
        code: currentTotpCode(secret, clock.now()),
      })
      .catch((error) => error);
    expect(httpBody(expired)).toMatchObject({ status: 401, code: "MFA_EXPIRED" });
    assertAuditClean(audits, session.accessToken);
    expect(JSON.stringify(audits)).not.toContain(secret);
  });

  it("não deixa refresh criar sessão privilegiada sem MFA", async () => {
    const { service } = harness(baseUser("SECRETARIA"));
    const pending = await service.login({ email: EMAIL, password: PASSWORD });
    expect(pending).not.toHaveProperty("accessToken");
    const missing = await service
      .refresh({
        userId: "user-sintetico",
        personId: PERSON,
        email: EMAIL,
        grants: [{ roleCode: "SECRETARIA", organizationId: "org1", churchId: "ch1" }],
      })
      .catch((error) => error);
    expect(httpBody(missing)).toMatchObject({ status: 401, code: "SESSION_INVALID" });

    const clock = new MutableClock();
    const box = harness(baseUser("SECRETARIA"), null, clock);
    const version = authzVersion({
      status: "ACTIVE",
      mfaRequired: false,
      email: EMAIL,
      personId: PERSON,
      factorState: "NONE",
      grants: [{ roleCode: "SECRETARIA", organizationId: "org1", churchId: "ch1", ministryId: null }],
    });
    const created = await box.sessions.create({
      userId: "user-sintetico",
      familyId: "family-sem-mfa",
      authzVersion: version,
      mfaSatisfied: false,
      expiresAtMs: clock.now() + 60_000,
    });
    const token = box.service.signAccessToken({
      sub: "user-sintetico",
      personId: PERSON,
      email: EMAIL,
      grants: [{ roleCode: "SECRETARIA", organizationId: "org1", churchId: "ch1" }],
      sid: created.sessionId,
      av: version,
      organizationId: "org1",
      churchId: "ch1",
    });
    const rejected = await box.service.verifyAccessToken(token).catch((error) => error);
    expect(httpBody(rejected)).toMatchObject({ status: 401, code: "SESSION_MFA_REQUIRED" });
    const second = await box.sessions.create({
      userId: "user-sintetico",
      familyId: "family-sem-mfa-2",
      authzVersion: version,
      mfaSatisfied: false,
      expiresAtMs: clock.now() + 60_000,
    });
    const refreshed = await box.service
      .refresh({
        userId: "user-sintetico",
        personId: PERSON,
        email: EMAIL,
        grants: [],
        sessionId: second.sessionId,
        organizationId: "org1",
        churchId: "ch1",
      })
      .catch((error) => error);
    expect(httpBody(refreshed)).toMatchObject({ status: 401, code: "SESSION_MFA_REQUIRED" });
  });

  it("revoga no logout, no logout geral, na rotação e depois de grant, desativação ou política", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const factor = { id: "factor-1", status: "ENABLED", secretCiphertext: encryptTotpSecret(secret) };
    const { service, user, audits } = harness(baseUser("PLATFORM_ADMIN"), factor);
    const firstLogin = await service.login({ email: EMAIL, password: PASSWORD });
    const first = await service.verifyMfaChallenge({
      challengeId: challengeIdOf(firstLogin),
      code: currentTotpCode(secret),
    });
    const secondLogin = await service.login({ email: EMAIL, password: PASSWORD });
    const second = await service.verifyMfaChallenge({
      challengeId: challengeIdOf(secondLogin),
      code: currentTotpCode(secret),
    });
    await service.logout(first.user);
    const afterLogout = await service.verifyAccessToken(first.accessToken).catch((error) => error);
    expect(httpBody(afterLogout)).toMatchObject({ status: 401, code: "SESSION_REVOKED" });
    await service.logoutAll(second.user);
    const afterAll = await service.verifyAccessToken(second.accessToken).catch((error) => error);
    expect(httpBody(afterAll).status).toBe(401);

    const again = await service.login({ email: EMAIL, password: PASSWORD });
    const current = await service.verifyMfaChallenge({
      challengeId: challengeIdOf(again),
      code: currentTotpCode(secret),
    });
    const rotated = await service.refresh(current.user);
    const replay = await service.verifyAccessToken(current.accessToken).catch((error) => error);
    expect(httpBody(replay).code).toBe("SESSION_REPLAY");
    const killed = await service.verifyAccessToken(rotated.accessToken).catch((error) => error);
    expect(httpBody(killed).status).toBe(401);

    const freshLogin = await service.login({ email: EMAIL, password: PASSWORD });
    const fresh = await service.verifyMfaChallenge({
      challengeId: challengeIdOf(freshLogin),
      code: currentTotpCode(secret),
    });
    user.grants.push({
      organizationId: "org1",
      churchId: "ch2",
      ministryId: null,
      role: { code: "TESOURARIA" },
    });
    const stale = await service.verifyAccessToken(fresh.accessToken).catch((error) => error);
    expect(httpBody(stale)).toMatchObject({ status: 401, code: "AUTHZ_STALE" });
    const staleRefresh = await service.refresh(fresh.user).catch((error) => error);
    expect(httpBody(staleRefresh).status).toBe(401);

    user.grants.pop();
    const restored = await service.login({ email: EMAIL, password: PASSWORD });
    const alive = await service.verifyMfaChallenge({
      challengeId: challengeIdOf(restored),
      code: currentTotpCode(secret),
    });
    user.status = "DISABLED";
    const inactive = await service.verifyAccessToken(alive.accessToken).catch((error) => error);
    expect(httpBody(inactive)).toMatchObject({ status: 401, code: "USER_INACTIVE" });

    user.status = "ACTIVE";
    const policyLogin = await service.login({ email: EMAIL, password: PASSWORD });
    const policySession = await service.verifyMfaChallenge({
      challengeId: challengeIdOf(policyLogin),
      code: currentTotpCode(secret),
    });
    process.env.AUTHZ_POLICY_VERSION = "f11a-policy-rotated";
    const policy = await service.verifyAccessToken(policySession.accessToken).catch((error) => error);
    expect(httpBody(policy)).toMatchObject({ status: 401, code: "AUTHZ_STALE" });
    assertAuditClean(audits, fresh.accessToken);
  });

  it("responde 403 na troca de congregação sem grant e 401 sem sessão", async () => {
    const { service } = harness(baseUser("MEMBRO"));
    const login = sessionOf(await service.login({ email: EMAIL, password: PASSWORD }));
    const denied = await service.switchChurch(login.user, "ch-other").catch((error) => error);
    expect(denied).toBeInstanceOf(ForbiddenException);
    expect(httpBody(denied).status).toBe(403);
    const absent = await service
      .switchChurch(
        { userId: "user-sintetico", personId: PERSON, email: EMAIL, grants: [] },
        "ch2",
      )
      .catch((error) => error);
    expect(httpBody(absent)).toMatchObject({ status: 401, code: "SESSION_INVALID" });
  });

  it("troca a congregação do admin só depois do MFA e mantém o contexto no refresh", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const { service } = harness(
      baseUser("PLATFORM_ADMIN", {
        grants: [
          { organizationId: "org1", churchId: null, ministryId: null, role: { code: "PLATFORM_ADMIN" } },
        ],
      }),
      { id: "factor-1", status: "ENABLED", secretCiphertext: encryptTotpSecret(secret) },
    );
    const pending = await service.login({ email: EMAIL, password: PASSWORD });
    const session = await service.verifyMfaChallenge({
      challengeId: challengeIdOf(pending),
      code: currentTotpCode(secret),
    });
    const moved = await service.switchChurch(session.user, "ch2");
    expect(moved.user.churchId).toBe("ch2");
    const refreshed = await service.refresh(moved.user);
    expect(refreshed.user.churchId).toBe("ch2");
    await expect(service.verifyAccessToken(moved.accessToken)).rejects.toBeTruthy();
  });

  it("limita tentativas de senha sem revelar a conta", async () => {
    process.env.AUTH_LOGIN_FAILURE_LIMIT = "3";
    const { service } = harness(baseUser("MEMBRO"));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const error = await service
        .login({ email: EMAIL, password: "errada-demais", clientIp: "203.0.113.9" })
        .catch((caught) => caught);
      expect(httpBody(error).code).toBe("INVALID_CREDENTIALS");
    }
    const blocked = await service
      .login({ email: EMAIL, password: PASSWORD, clientIp: "198.51.100.20" })
      .catch((error) => error);
    const body = httpBody(blocked);
    expect(blocked).toBeInstanceOf(HttpException);
    expect(body.status).toBe(429);
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.message).not.toContain(EMAIL);
    expect(body.message).not.toContain(PASSWORD);
  });

  it("falha fechado se o store de sessão ou de desafio quebra, sem emitir JWT", async () => {
    const passwordUser = baseUser("MEMBRO");
    const brokenSessions: SessionStore = {
      create: async () => {
        throw new Error("relation auth_sessions does not exist password=leak");
      },
      get: async () => null,
      revoke: async () => undefined,
      revokeAllForUser: async () => undefined,
      revokeFamily: async () => undefined,
    };
    const clock = new AuthClock();
    const member = new AuthService(
      harness(passwordUser).prisma as never,
      { getPilotChurch: async () => ({ organizationId: "org1", churchId: "ch1" }) } as never,
      brokenSessions,
      new InMemoryMfaChallengeStore(clock),
      new InMemoryAuthAttemptLimiter(clock),
      clock,
    );
    const down = await member.login({ email: EMAIL, password: PASSWORD }).catch((error) => error);
    expect(down).toBeInstanceOf(ServiceUnavailableException);
    expect(String((down as Error).message)).not.toContain("password");
    expect(String((down as Error).message)).not.toContain("leak");

    const brokenChallenges = {
      create: async () => {
        throw new Error("relation auth_mfa_challenges otpauth://totp/secret");
      },
      get: async () => null,
      recordFailure: async () => ({ burned: true }),
      recordRead: async () => ({ burned: true }),
      consume: async () => "missing" as const,
    };
    const privileged = new AuthService(
      harness(baseUser("TESOURARIA")).prisma as never,
      { getPilotChurch: async () => ({ organizationId: "org1", churchId: "ch1" }) } as never,
      new InMemorySessionStore(clock),
      brokenChallenges,
      new InMemoryAuthAttemptLimiter(clock),
      clock,
    );
    const blocked = await privileged.login({ email: EMAIL, password: PASSWORD }).catch((error) => error);
    expect(blocked).toBeInstanceOf(ServiceUnavailableException);
    expect(String((blocked as Error).message)).not.toContain("otpauth");
  });

  it("expira o JWT de sessão quando o relógio passa da validade", async () => {
    const clock = new MutableClock();
    const { service } = harness(baseUser("MEMBRO"), null, clock);
    const login = sessionOf(await service.login({ email: EMAIL, password: PASSWORD }));
    clock.advance(3600 * 1000 + 1000);
    const expired = await service.verifyAccessToken(login.accessToken).catch((error) => error);
    expect(String((expired as Error).message)).toMatch(/expir/);
    expect(String((expired as Error).message)).not.toContain(login.accessToken);
  });
});
