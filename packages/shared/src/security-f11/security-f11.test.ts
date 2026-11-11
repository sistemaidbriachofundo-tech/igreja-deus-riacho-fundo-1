import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLE_CODES } from "../rbac";
import {
  AuditWriteRejected,
  sanitizeAuditCreateData,
} from "./audit-write";
import {
  MemoryMfaChallengeRepository,
  MfaChallengeService,
} from "./mfa-challenge";
import {
  DEFAULT_SECURITY_POLICY,
  assertRuntimePolicy,
  mfaBlocksPrivilegedSession,
  requiresPrivilegedMfa,
} from "./policy";
import { MemoryRateLimitStore } from "./rate-limit";
import { MemorySessionRepository, SessionService } from "./session";
import { acceptRequestId, hashOpaqueToken } from "./token";

const NOW = new Date("2026-11-11T12:00:00.000Z");
const TTL = 60_000;

describe("sessão revogável", () => {
  it("emite, revoga e recusa o refresh depois do logout", async () => {
    const service = new SessionService(new MemorySessionRepository());
    const issued = await service.issue({
      userId: "user-1",
      authzVersion: 1,
      policyVersion: 1,
      ttlMs: TTL,
      now: NOW,
    });
    assert.equal(issued.session.refreshTokenHash, hashOpaqueToken(issued.refreshToken));
    assert.equal(JSON.stringify(issued.session).includes(issued.refreshToken), false);

    const active = await service.assertActive({
      refreshToken: issued.refreshToken,
      userAuthzVersion: 1,
      policyVersion: 1,
      now: NOW,
    });
    assert.equal(active.ok, true);
    assert.equal(await service.revoke(issued.session.id, "logout", NOW), true);

    const after = await service.assertActive({
      refreshToken: issued.refreshToken,
      userAuthzVersion: 1,
      policyVersion: 1,
      now: NOW,
    });
    assert.deepEqual(after, { ok: false, reason: "revoked" });
  });

  it("revoga todas as sessões do usuário", async () => {
    const service = new SessionService(new MemorySessionRepository());
    const first = await service.issue({
      userId: "user-1",
      authzVersion: 1,
      policyVersion: 1,
      ttlMs: TTL,
      now: NOW,
    });
    const second = await service.issue({
      userId: "user-1",
      authzVersion: 1,
      policyVersion: 1,
      ttlMs: TTL,
      now: NOW,
    });
    assert.equal(await service.revokeAll("user-1", "logout_all", NOW), 2);
    for (const token of [first.refreshToken, second.refreshToken]) {
      const result = await service.assertActive({
        refreshToken: token,
        userAuthzVersion: 1,
        policyVersion: 1,
        now: NOW,
      });
      assert.equal(result.ok, false);
    }
  });

  it("invalida a família quando um refresh já rotacionado é reapresentado", async () => {
    const service = new SessionService(new MemorySessionRepository());
    const issued = await service.issue({
      userId: "user-1",
      authzVersion: 3,
      policyVersion: 2,
      ttlMs: TTL,
      now: NOW,
    });
    const rotated = await service.rotate({
      refreshToken: issued.refreshToken,
      userAuthzVersion: 3,
      policyVersion: 2,
      ttlMs: TTL,
      now: NOW,
    });
    assert.equal(rotated.ok, true);
    if (!rotated.ok) return;

    const replay = await service.rotate({
      refreshToken: issued.refreshToken,
      userAuthzVersion: 3,
      policyVersion: 2,
      ttlMs: TTL,
      now: NOW,
    });
    assert.deepEqual(replay, { ok: false, reason: "replay" });

    const survivor = await service.assertActive({
      refreshToken: rotated.refreshToken,
      userAuthzVersion: 3,
      policyVersion: 2,
      now: NOW,
    });
    assert.deepEqual(survivor, { ok: false, reason: "revoked" });
  });

  it("recusa sessão quando a versão de autorização ou de política muda", async () => {
    const service = new SessionService(new MemorySessionRepository());
    const issued = await service.issue({
      userId: "user-1",
      authzVersion: 1,
      policyVersion: 4,
      ttlMs: TTL,
      now: NOW,
    });
    const staleAuthz = await service.assertActive({
      refreshToken: issued.refreshToken,
      userAuthzVersion: 2,
      policyVersion: 4,
      now: NOW,
    });
    assert.deepEqual(staleAuthz, { ok: false, reason: "authz_stale" });

    const other = await service.issue({
      userId: "user-2",
      authzVersion: 1,
      policyVersion: 4,
      ttlMs: TTL,
      now: NOW,
    });
    const stalePolicy = await service.assertActive({
      refreshToken: other.refreshToken,
      userAuthzVersion: 1,
      policyVersion: 5,
      now: NOW,
    });
    assert.deepEqual(stalePolicy, { ok: false, reason: "policy_stale" });
  });

  it("expira e não reconhece token desconhecido", async () => {
    const service = new SessionService(new MemorySessionRepository());
    const issued = await service.issue({
      userId: "user-1",
      authzVersion: 1,
      policyVersion: 1,
      ttlMs: 1_000,
      now: NOW,
    });
    const expired = await service.assertActive({
      refreshToken: issued.refreshToken,
      userAuthzVersion: 1,
      policyVersion: 1,
      now: new Date(NOW.getTime() + 1_000),
    });
    assert.deepEqual(expired, { ok: false, reason: "expired" });
    const missing = await service.assertActive({
      refreshToken: "nao-existe",
      userAuthzVersion: 1,
      policyVersion: 1,
      now: NOW,
    });
    assert.deepEqual(missing, { ok: false, reason: "not_found" });
  });
});

describe("desafio MFA de uso único", () => {
  it("consome uma vez e bloqueia replay", async () => {
    const service = new MfaChallengeService(new MemoryMfaChallengeRepository());
    const issued = await service.issue({
      userId: "user-1",
      purpose: "LOGIN",
      ttlMs: TTL,
      now: NOW,
    });
    assert.equal(JSON.stringify(issued.challenge).includes(issued.token), false);
    const first = await service.consume(issued.token, NOW);
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.challenge.status, "CONSUMED");
    const replay = await service.consume(issued.token, NOW);
    assert.deepEqual(replay, { ok: false, reason: "replay" });
  });

  it("expira, esgota tentativas e não aceita token desconhecido", async () => {
    const service = new MfaChallengeService(new MemoryMfaChallengeRepository());
    const issued = await service.issue({
      userId: "user-1",
      purpose: "STEP_UP",
      ttlMs: 5_000,
      maxAttempts: 2,
      now: NOW,
    });
    assert.equal(await service.registerFailure(issued.token, NOW), "pending");
    assert.equal(await service.registerFailure(issued.token, NOW), "attempts");
    const blocked = await service.consume(issued.token, NOW);
    assert.deepEqual(blocked, { ok: false, reason: "attempts" });

    const short = await service.issue({
      userId: "user-1",
      purpose: "REFRESH",
      ttlMs: 500,
      now: NOW,
    });
    const expired = await service.consume(short.token, new Date(NOW.getTime() + 500));
    assert.deepEqual(expired, { ok: false, reason: "expired" });
    const missing = await service.consume("outro-token", NOW);
    assert.deepEqual(missing, { ok: false, reason: "not_found" });
  });
});

describe("limite de taxa compartilhado", () => {
  it("bloqueia a partir do limite e não grava a chave bruta", async () => {
    const store = new MemoryRateLimitStore();
    const key = "POST:/auth/login:203.0.113.10";
    const first = await store.hit({ key, limit: 2, windowMs: 60_000, now: 1_000 });
    const second = await store.hit({ key, limit: 2, windowMs: 60_000, now: 1_500 });
    const third = await store.hit({ key, limit: 2, windowMs: 60_000, now: 2_000 });
    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.equal(third.hits, 3);
    assert.equal([...store.buckets.keys()].some((stored) => stored.includes("203.0.113.10")), false);
    assert.equal(store.buckets.has(hashOpaqueToken(key)), true);
  });

  it("separa chaves e reabre a janela seguinte", async () => {
    const store = new MemoryRateLimitStore();
    await store.hit({ key: "a", limit: 1, windowMs: 1_000, now: 1_000 });
    const blocked = await store.hit({ key: "a", limit: 1, windowMs: 1_000, now: 1_200 });
    const other = await store.hit({ key: "b", limit: 1, windowMs: 1_000, now: 1_200 });
    const nextWindow = await store.hit({ key: "a", limit: 1, windowMs: 1_000, now: 2_000 });
    assert.equal(blocked.allowed, false);
    assert.equal(other.allowed, true);
    assert.equal(nextWindow.allowed, true);
    assert.equal(nextWindow.hits, 1);
  });
});

describe("política de MFA", () => {
  it("exige MFA de papéis privilegiados e de combinações, e não do membro comum", () => {
    assert.equal(requiresPrivilegedMfa(DEFAULT_SECURITY_POLICY, [ROLE_CODES.MEMBRO]), false);
    assert.equal(requiresPrivilegedMfa(DEFAULT_SECURITY_POLICY, [ROLE_CODES.SECRETARIA]), true);
    assert.equal(
      requiresPrivilegedMfa(DEFAULT_SECURITY_POLICY, [ROLE_CODES.MEMBRO, ROLE_CODES.PASTOR]),
      true,
    );
    assert.equal(
      requiresPrivilegedMfa(DEFAULT_SECURITY_POLICY, [ROLE_CODES.TESOURARIA]),
      true,
    );
    assert.equal(
      requiresPrivilegedMfa(
        { ...DEFAULT_SECURITY_POLICY, mfaEnforcement: "ALL" },
        [ROLE_CODES.MEMBRO],
      ),
      true,
    );
    assert.equal(
      requiresPrivilegedMfa(
        { ...DEFAULT_SECURITY_POLICY, mfaEnforcement: "OFF" },
        [ROLE_CODES.PLATFORM_ADMIN],
      ),
      false,
    );
  });

  it("não desliga o bloqueio em produção e evita lockout acidental fora dela", () => {
    const privileged = {
      stage: "production" as const,
      blockingFlag: "false",
      policy: DEFAULT_SECURITY_POLICY,
      roleCodes: [ROLE_CODES.PLATFORM_ADMIN],
    };
    assert.equal(mfaBlocksPrivilegedSession(privileged), true);
    assert.equal(
      mfaBlocksPrivilegedSession({ ...privileged, stage: "qa", blockingFlag: undefined }),
      false,
    );
    assert.equal(
      mfaBlocksPrivilegedSession({ ...privileged, stage: "qa", blockingFlag: "true" }),
      true,
    );
    assert.throws(() => assertRuntimePolicy("production", {
      ...DEFAULT_SECURITY_POLICY,
      mfaEnforcement: "OFF",
    }));
  });
});

describe("auditoria antes da persistência", () => {
  it("remove segredo aninhado, e-mail, CPF, JWT e chave Unicode", () => {
    const clean = sanitizeAuditCreateData({
      actorUserId: "user-1",
      action: "person.update",
      resourceType: "person",
      resourceId: "person-1",
      organizationId: "org-1",
      churchId: "church-1",
      outcome: "SUCCESS",
      requestId: "req-12345678",
      metadata: {
        emailFingerprint: "abc123",
        status: "ACTIVE",
        password: "segredo",
        nested: { Senha: "outra", note: "pessoa@example.org" },
        "p\u0430ssword": "homoglyph",
        document: "123.456.789-09",
        header: "aaaaaaaa.bbbbbbbb.cccccccc",
        reason: "invalid_user",
      },
    });
    const encoded = JSON.stringify(clean);
    assert.equal(encoded.includes("segredo"), false);
    assert.equal(encoded.includes("outra"), false);
    assert.equal(encoded.includes("pessoa@example.org"), false);
    assert.equal(encoded.includes("homoglyph"), false);
    assert.equal(encoded.includes("123.456.789-09"), false);
    assert.equal(encoded.includes("aaaaaaaa.bbbbbbbb.cccccccc"), false);
    assert.equal(clean.metadata?.emailFingerprint, "abc123");
    assert.equal(clean.metadata?.status, "ACTIVE");
    assert.equal(clean.metadata?.reason, "invalid_user");
    assert.equal(clean.requestId, "req-12345678");
    assert.equal(clean.outcome, "SUCCESS");
  });

  it("rejeita ação inválida e descarta identificador de correlação malformado", () => {
    assert.throws(
      () => sanitizeAuditCreateData({ action: "tem espaço", resourceType: "person" }),
      AuditWriteRejected,
    );
    const clean = sanitizeAuditCreateData({
      action: "auth.login_failed",
      resourceType: "auth",
      outcome: "TALVEZ",
      requestId: "pessoa@example.org",
      metadata: { reason: "invalid_password" },
    });
    assert.equal(clean.outcome, null);
    assert.equal(clean.requestId, null);
    assert.equal(clean.metadata?.reason, "invalid_password");
    assert.equal(acceptRequestId("curto"), undefined);
    assert.equal(acceptRequestId("req-valido-1"), "req-valido-1");
  });
});
