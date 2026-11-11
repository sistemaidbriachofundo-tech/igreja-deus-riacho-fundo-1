import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QA_ORIGIN, QA_CHECKS, assertQaOrigin, runQaSmoke } from "./qa-api-smoke.mjs";

function mockFetch(calls, ready = { status: "ready", database: "ok", authState: "prisma", mfaBlocking: false, commit: "e04ea29d9f01" }) {
  return async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ url, options });
    const status = path === "/ready" || path === "/health" ? 200
      : path === "/internal/observability/metrics" ? 404 : 401;
    return { status, async json() { return ready; } };
  };
}

describe("F1.1 QA smoke seguro", () => {
  it("aceita apenas o hostname HTTPS fixo da QA", () => {
    assert.equal(assertQaOrigin(QA_ORIGIN), QA_ORIGIN);
    for (const unsafe of [
      "https://id-riacho1-api-hml.vercel.app",
      "https://id-riacho1-api.vercel.app",
      "http://id-riacho1-api-qa.vercel.app",
      QA_ORIGIN + "/qualquer-rota",
      "https://id-riacho1-api-qa.vercel.app.evil.test",
      "https://user:pass@id-riacho1-api-qa.vercel.app",
    ]) assert.throws(() => assertQaOrigin(unsafe));
  });

  it("confere readiness persistente e rotas anônimas sem fazer login", async () => {
    const calls = [];
    const report = await runQaSmoke({
      fetchImpl: mockFetch(calls), expectedSha: "e04ea29d9f013951a6b139fdf8f704486f0e765d",
    });
    assert.equal(report.verdict, "PASS");
    assert.equal(report.sameDeployment, true);
    assert.equal(calls.length, 1 + QA_CHECKS.length);
    assert.equal(calls.some(({ options }) => options.method === "POST"), false);
  });

  it("no máximo um login fictício e não expõe corpo de autenticação", async () => {
    const calls = [];
    const report = await runQaSmoke({ fetchImpl: mockFetch(calls), loginCheck: true });
    assert.equal(report.verdict, "PASS");
    const attempts = calls.filter(({ options }) => options.method === "POST");
    assert.equal(attempts.length, 1);
    assert.equal(JSON.parse(attempts[0].options.body).email.endsWith("@example.test"), true);
    assert.equal(JSON.stringify(report).includes("synthetic-invalid-credential"), false);
  });

  it("aborta demais chamadas se a readiness ou o SHA esperado não confere", async () => {
    const calls = [];
    const report = await runQaSmoke({ fetchImpl: mockFetch(calls), expectedSha: "ffffffffffff" });
    assert.equal(report.verdict, "NOT_READY");
    assert.equal(report.sameDeployment, false);
    assert.equal(calls.length, 1);
  });

  it("não trata memória como sessões persistentes", async () => {
    const calls = [];
    const report = await runQaSmoke({
      fetchImpl: mockFetch(calls), loginCheck: true,
      expectedSha: null,
    });
    assert.equal(report.verdict, "PASS");
    const fails = await runQaSmoke({
      fetchImpl: mockFetch([], {
        status: "ready", database: "ok", authState: "memory",
        mfaBlocking: false, commit: "e04ea29d9f01",
      }),
    });
    assert.equal(fails.verdict, "NOT_READY");
    assert.equal(fails.results.length, 1);
  });
});
