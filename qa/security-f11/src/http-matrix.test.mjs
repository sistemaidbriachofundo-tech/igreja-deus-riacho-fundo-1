import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAllowedOrigin,
  compareLoginMessages,
  redact,
  runHttpMatrix,
} from "./http-matrix.mjs";

describe("barreira de origem", () => {
  it("aceita o host de homologação já usado pelo QA e o loopback", () => {
    assert.equal(
      assertAllowedOrigin("https://id-riacho1-api-hml.vercel.app"),
      "https://id-riacho1-api-hml.vercel.app",
    );
    assert.equal(assertAllowedOrigin("http://127.0.0.1:3001"), "http://127.0.0.1:3001");
  });

  it("recusa produção, host desconhecido e credencial na URL", () => {
    assert.throws(() => assertAllowedOrigin("https://id-riacho1-api.vercel.app"));
    assert.throws(() => assertAllowedOrigin("https://example.com"));
    assert.throws(() => assertAllowedOrigin("http://id-riacho1-api-hml.vercel.app"));
    assert.throws(() => assertAllowedOrigin("https://user:secret@id-riacho1-api-hml.vercel.app"));
  });
});

describe("redação", () => {
  it("remove bearer, jwt e e-mail do corpo gravado", () => {
    const clean = redact("Bearer aaa.bbb.ccc eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln ana.demo@example.test");
    assert.equal(clean.includes("ana.demo"), false);
    assert.equal(clean.includes("eyJhbGci"), false);
    assert.match(clean, /\[email\]/);
    assert.match(clean, /\[jwt\]|Bearer \[redacted\]/);
  });
});

describe("matriz HTTP contra um duplo local", () => {
  it("para se o meta diz produção", async () => {
    const fetchImpl = async (url) => ({
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
      async text() {
        return url.endsWith("/meta")
          ? JSON.stringify({ stage: "production", sourceSha: "abc" })
          : "{}";
      },
    });
    const report = await runHttpMatrix({
      origin: "http://127.0.0.1:9",
      fetchImpl: adapt(fetchImpl),
      candidateSha: "31d3158c7619bbc4c9d24fd9b94e43ef056ab80e",
    });
    assert.equal(report.aborted, true);
    assert.equal(report.results.length, 1);
  });

  it("classifica 401 anônimo e falha se o CORS reflete origem estranha", async () => {
    const fetchImpl = async (url, init) => {
      const path = new URL(url).pathname;
      const headers = new Headers({ "content-type": "application/json", "x-content-type-options": "nosniff" });
      if (init.headers?.origin) headers.set("access-control-allow-origin", init.headers.origin);
      const status = path === "/meta" || path === "/health" || path === "/ready" ? 200 : 401;
      const body = path === "/meta"
        ? JSON.stringify({ stage: "non-production", sourceSha: "31d3158c7619bbc4c9d24fd9b94e43ef056ab80e" })
        : path === "/auth/login"
          ? JSON.stringify({ message: "Credenciais inválidas" })
          : "{}";
      return { status: path === "/auth/login" ? 401 : status, headers, async text() { return body; } };
    };
    const report = await runHttpMatrix({
      origin: "http://127.0.0.1:9",
      fetchImpl,
      candidateSha: "31d3158c7619bbc4c9d24fd9b94e43ef056ab80e",
    });
    assert.equal(report.aborted, false);
    assert.equal(report.shaMatchesCandidate, true);
    assert.equal(report.results.find((item) => item.id === "E2E-401-ME").verdict, "PASS");
    assert.equal(report.results.find((item) => item.id === "E2E-CORS").verdict, "FAIL");
    assert.equal(report.login.verdict, "PASS");
  });
});

describe("mensagens de login", () => {
  it("não compara corpos ausentes", () => {
    assert.equal(compareLoginMessages(undefined, undefined).verdict, "BLOCKED");
  });
});

function adapt(fetchImpl) {
  return async (url, init) => {
    const raw = await fetchImpl(url, init);
    return {
      ...raw,
      headers: {
        get(name) {
          return raw.headers.get(name);
        },
      },
    };
  };
}
