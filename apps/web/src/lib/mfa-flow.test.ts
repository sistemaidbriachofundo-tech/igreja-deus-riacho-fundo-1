import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiLogin, beginLogin, beginMfaEnrollment, clearToken, loadStoredToken,
  mfaFailureMessage, storeToken, verifyLoginChallenge,
} from "./api";

const original = process.env.NEXT_PUBLIC_API_URL;
const url = "https://api.example.test";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => { process.env.NEXT_PUBLIC_API_URL = url; });
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = original;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pending = {
  mfa: {
    challengeId: "challenge-id-that-is-long-enough-for-dto",
    expiresInSeconds: 180,
    required: true,
    enrollmentRequired: false,
    challengeRequired: true,
  },
};
const privileged = {
  accessToken: "verified-mfa-jwt",
  tokenType: "Bearer",
  expiresInSeconds: 3600,
  user: {
    userId: "user-admin", personId: "person-admin", email: "admin@example.test",
    grants: [{ roleCode: "PLATFORM_ADMIN" }],
  },
};

describe("MFA: bloqueio de login privilegiado no frontend DEV", () => {
  it("não tenta guardar JWT quando a senha retorna desafio e não token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(pending));
    vi.stubGlobal("fetch", fetchMock);
    await expect(beginLogin("admin@example.test", "senha-sintetica")).resolves.toEqual(pending);
    await expect(apiLogin("admin@example.test", "senha-sintetica")).rejects.toThrow("segundo fator");
    expect(fetchMock.mock.calls.every(call => call[0] === url + "/auth/login")).toBe(true);
  });

  it("confirma TOTP antes de receber JWT e não inclui Authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(privileged));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyLoginChallenge(pending.mfa, "123456")).resolves.toEqual(privileged);
    expect(fetchMock.mock.calls[0][0]).toBe(url + "/auth/mfa/challenge");
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      challengeId: pending.mfa.challengeId, code: "123456",
    });
  });

  it("usa o endpoint correto no primeiro enrollment MFA", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond({ secret: "synthetic-secret", otpauthUri: "otpauth://totp/test" }))
      .mockResolvedValueOnce(respond(privileged));
    vi.stubGlobal("fetch", fetchMock);
    const enrollChallenge = { ...pending.mfa, enrollmentRequired: true };
    await expect(beginMfaEnrollment(enrollChallenge.challengeId)).resolves.toHaveProperty("otpauthUri");
    await expect(verifyLoginChallenge(enrollChallenge, "123456")).resolves.toEqual(privileged);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      url + "/auth/mfa/enroll", url + "/auth/mfa/enroll/confirm",
    ]);
  });

  it("não aceita um código inválido como sessão", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond({ code: "MFA_INVALID" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyLoginChallenge(pending.mfa, "000000")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][1].body).not.toContain("accessToken");
  });

  it("limpa somente o token local e nunca persiste desafio MFA", () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    } });
    storeToken("synthetic-jwt");
    expect(loadStoredToken()).toBe("synthetic-jwt");
    clearToken();
    expect(loadStoredToken()).toBeNull();
    expect([...memory.keys()]).not.toContain("challengeId");
  });

  it("não revela detalhes técnicos ao usuário com código incorreto", () => {
    expect(mfaFailureMessage({ status: 401, message: "invalid" })).toBeTruthy();
  });
});
