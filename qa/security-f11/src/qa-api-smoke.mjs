/**
 * Smoke HTTP exclusivo da API isolada F1.1 QA.
 * Sem contas reais, mensagens, uploads, mutações no esquema ou destinos arbitrários.
 * Login inválido sintético é opcional e ocorre no máximo uma vez por execução.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const QA_ORIGIN = "https://id-riacho1-api-qa.vercel.app";
export const QA_CHECKS = Object.freeze([
  { id: "health", method: "GET", path: "/health", expected: 200 },
  { id: "me-anon", method: "GET", path: "/auth/me", expected: 401 },
  { id: "audit-anon", method: "GET", path: "/audit-logs", expected: 401 },
  { id: "metrics-anon", method: "GET", path: "/internal/observability/metrics", expected: 404 },
]);

export function assertQaOrigin(origin) {
  const url = new URL(origin);
  if (url.origin !== QA_ORIGIN || url.href !== QA_ORIGIN + "/") {
    throw new Error("Origem bloqueada: apenas a API F1.1 isolada de QA é permitida");
  }
  return url.origin;
}

async function probe(fetchImpl, origin, item) {
  try {
    const options = {
      method: item.method,
      redirect: "manual",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    };
    if (item.method === "POST") {
      options.headers["content-type"] = "application/json";
      options.body = JSON.stringify({
        email: "nobody.f11qa@example.test",
        password: "synthetic-invalid-credential",
      });
    }
    const response = await fetchImpl(origin + item.path, options);
    const verdict = response.status === item.expected
      ? "PASS" : response.status === 429 ? "BLOCKED" : "FAIL";
    return { id: item.id, method: item.method, path: item.path, status: response.status, verdict, response };
  } catch (error) {
    return { id: item.id, method: item.method, path: item.path, status: null, verdict: "BLOCKED", errorType: error?.name ?? "Error" };
  }
}

export async function runQaSmoke({
  fetchImpl = globalThis.fetch, origin = QA_ORIGIN, expectedSha = null, loginCheck = false,
} = {}) {
  const base = assertQaOrigin(origin);
  if (expectedSha !== null && !/^[a-f0-9]{12,40}$/i.test(expectedSha)) {
    throw new Error("SHA esperado deve conter entre 12 e 40 dígitos hexadecimais");
  }
  const ready = await probe(fetchImpl, base, { id: "ready", method: "GET", path: "/ready", expected: 200 });
  let readiness = null;
  if (ready.verdict === "PASS") {
    try {
      const body = await ready.response.json();
      readiness = {
        database: body.database ?? null, authState: body.authState ?? null,
        mfaBlocking: body.mfaBlocking ?? null, commit: body.commit ?? null,
      };
      if (body.status !== "ready" || body.database !== "ok" || body.authState !== "prisma" ||
          typeof body.mfaBlocking !== "boolean" || !/^[a-f0-9]{7,12}$/i.test(body.commit ?? "")) {
        ready.verdict = "FAIL";
      }
      if (expectedSha && body.commit !== expectedSha.slice(0, body.commit?.length ?? 0).toLowerCase()) {
        ready.verdict = "FAIL";
      }
    } catch {
      ready.verdict = "FAIL";
    }
  }
  delete ready.response;
  const results = [ready];
  if (ready.verdict === "PASS") {
    for (const item of QA_CHECKS) {
      const result = await probe(fetchImpl, base, item);
      delete result.response;
      results.push(result);
    }
    if (loginCheck) {
      const result = await probe(fetchImpl, base, {
        id: "login-sintetico-invalido", method: "POST", path: "/auth/login", expected: 401,
      });
      delete result.response;
      results.push(result);
    }
  }
  return {
    origin: base, observedCommit: readiness?.commit ?? null,
    expectedSha: expectedSha ?? null,
    sameDeployment: expectedSha ? readiness?.commit === expectedSha.slice(0, readiness.commit?.length ?? 0).toLowerCase() : null,
    readiness, loginCheck, results,
    verdict: results.every((item) => item.verdict === "PASS") ? "PASS" : "NOT_READY",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const flags = process.argv.slice(2);
  const allowed = flags.every((flag) => flag === "--login-check" || /^--expected-sha=[0-9a-fA-F]{12,40}$/.test(flag));
  if (!allowed) {
    console.error("Uso: node qa-api-smoke.mjs [--login-check] [--expected-sha=<commit>]");
    process.exitCode = 2;
  } else {
    try {
      const value = flags.find((flag) => flag.startsWith("--expected-sha="));
      const report = await runQaSmoke({
        loginCheck: flags.includes("--login-check"),
        expectedSha: value ? value.split("=")[1] : null,
      });
      console.log(JSON.stringify(report, null, 2));
      if (report.verdict !== "PASS") process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Falha de QA");
      process.exitCode = 2;
    }
  }
}