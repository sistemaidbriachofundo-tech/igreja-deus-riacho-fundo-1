/**
 * Provas HTTP curtas. Recusa qualquer host fora da lista.
 * Não faz carga, não envia mensagem, não envia arquivo e não tenta senha real.
 */

export const HML_ORIGIN = "https://id-riacho1-api-hml.vercel.app";

const ALLOWED_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "id-riacho1-api-hml.vercel.app",
]);

const SYNTHETIC_EMAIL = "nobody.f11d@example.test";
const SYNTHETIC_PASSWORD = "synthetic-invalid-credential";

export function assertAllowedOrigin(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Origem inválida");
  }
  const host = url.hostname.toLowerCase();
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (url.protocol !== "https:" && !loopback) {
    throw new Error("Origem recusada: só HTTPS ou loopback");
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error("Origem recusada: host fora da lista de homologação ou loopback");
  }
  if (url.username || url.password) {
    throw new Error("Origem recusada: credencial na URL");
  }
  return url.origin;
}

export function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[jwt]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/set-cookie:[^\n]+/gi, "set-cookie: [redacted]")
    .slice(0, 420);
}

export function probes() {
  return [
    { id: "E2E-META", method: "GET", path: "/meta", expect: [200] },
    { id: "E2E-HEALTH", method: "GET", path: "/health", expect: [200] },
    { id: "E2E-READY", method: "GET", path: "/ready", expect: [200, 503] },
    { id: "E2E-401-ME", method: "GET", path: "/auth/me", expect: [401] },
    { id: "E2E-401-PERSON", method: "GET", path: "/persons/pessoa-sintetica", expect: [401] },
    { id: "E2E-401-PASTORAL", method: "GET", path: "/pastoral-cases", expect: [401] },
    { id: "E2E-401-LEDGER", method: "GET", path: "/ledger/accounts", expect: [401] },
    { id: "E2E-401-AUDIT", method: "GET", path: "/audit-logs", expect: [401] },
    { id: "E2E-401-REFRESH", method: "POST", path: "/auth/refresh", body: {}, expect: [401] },
    {
      id: "E2E-401-SWITCH",
      method: "POST",
      path: "/auth/switch-church",
      body: { churchId: "igreja-sintetica" },
      expect: [401],
    },
    {
      id: "E2E-LOGIN-UNKNOWN",
      method: "POST",
      path: "/auth/login",
      body: { email: SYNTHETIC_EMAIL, password: SYNTHETIC_PASSWORD },
      expect: [401, 400, 429],
    },
    {
      id: "E2E-LOGIN-UNKNOWN-2",
      method: "POST",
      path: "/auth/login",
      body: { email: SYNTHETIC_EMAIL, password: `${SYNTHETIC_PASSWORD}-2` },
      expect: [401, 400, 429],
    },
    { id: "E2E-QR-SHORT", method: "GET", path: "/credentials/verify/curto", expect: [400, 404] },
    { id: "E2E-CORS", method: "GET", path: "/health", origin: "https://qa-f11.example.test", expect: [200] },
  ];
}

export function judgeProbe(probe, response) {
  const status = response.status;
  const allowed = probe.expect.includes(status);
  const setCookie = response.headers["set-cookie"];
  const notes = [];
  if (setCookie) notes.push("set-cookie presente");
  let verdict = allowed ? "PASS" : "FAIL";
  if (probe.id === "E2E-CORS") {
    const allow = response.headers["access-control-allow-origin"];
    if (allow === "https://qa-f11.example.test" || allow === "*") {
      notes.push("CORS refletiu origem que não está na configuração");
      verdict = "FAIL";
    }
  }
  if (setCookie) verdict = "FAIL";
  return {
    id: probe.id,
    method: probe.method,
    path: probe.path,
    status,
    verdict,
    notes,
    body: redact(response.body),
    headers: {
      nosniff: response.headers["x-content-type-options"] ?? null,
      frame: response.headers["x-frame-options"] ?? null,
      hsts: response.headers["strict-transport-security"] ?? null,
      cache: response.headers["cache-control"] ?? null,
      cors: response.headers["access-control-allow-origin"] ?? null,
      setCookie: Boolean(setCookie),
    },
  };
}

export function compareLoginMessages(first, second) {
  if (!first || !second) return { verdict: "BLOCKED", detail: "As duas tentativas sintéticas não completaram." };
  if (first.status === 429 || second.status === 429) {
    return { verdict: "BLOCKED", detail: "A homologação limitou a taxa. Não houve nova tentativa." };
  }
  if (first.status !== 401 || second.status !== 401) {
    return {
      verdict: "FAIL",
      detail: `Esperado 401 nas duas contas inexistentes; veio ${first.status} e ${second.status}.`,
    };
  }
  if (first.body === second.body) {
    return { verdict: "PASS", detail: "As duas senhas inválidas da conta sintética inexistente devolveram o mesmo corpo." };
  }
  return { verdict: "FAIL", detail: "Os corpos das duas falhas sintéticas diferem." };
}

export async function runHttpMatrix({ origin, fetchImpl, candidateSha }) {
  const base = assertAllowedOrigin(origin);
  const results = [];
  for (const probe of probes()) {
    const headers = { accept: "application/json" };
    if (probe.origin) headers.origin = probe.origin;
    if (probe.body) headers["content-type"] = "application/json";
    let response;
    try {
      const raw = await fetchImpl(`${base}${probe.path}`, {
        method: probe.method,
        headers,
        body: probe.body ? JSON.stringify(probe.body) : undefined,
        redirect: "manual",
      });
      const text = await raw.text();
      const headerBag = {};
      for (const name of [
        "content-type",
        "access-control-allow-origin",
        "x-content-type-options",
        "x-frame-options",
        "cache-control",
        "strict-transport-security",
      ]) {
        const value = raw.headers.get(name);
        if (value) headerBag[name] = value.slice(0, 180);
      }
      if (raw.headers.get("set-cookie")) headerBag["set-cookie"] = "present";
      response = { status: raw.status, headers: headerBag, body: storedBody(probe.id, text) };
    } catch (error) {
      results.push({
        id: probe.id,
        method: probe.method,
        path: probe.path,
        status: 0,
        verdict: "BLOCKED",
        notes: [redact(error instanceof Error ? error.message : "falha de rede")],
        body: "",
      });
      continue;
    }
    results.push(judgeProbe(probe, response));
    if (probe.id === "E2E-META") {
      const stage = readJsonField(response.body, "stage");
      const sourceSha = readJsonField(response.body, "sourceSha");
      if (stage === "production") {
        return {
          origin: base,
          aborted: true,
          reason: "O meta da origem informou stage production. A suíte parou.",
          sourceSha: sourceSha || null,
          candidateSha,
          shaMatchesCandidate: false,
          results,
        };
      }
    }
  }
  const meta = results.find((item) => item.id === "E2E-META");
  const sourceSha = meta ? readJsonField(meta.body, "sourceSha") : null;
  const login = compareLoginMessages(
    results.find((item) => item.id === "E2E-LOGIN-UNKNOWN"),
    results.find((item) => item.id === "E2E-LOGIN-UNKNOWN-2"),
  );
  const shaMatchesCandidate = Boolean(sourceSha) && sourceSha === candidateSha;
  return {
    origin: base,
    aborted: false,
    sourceSha,
    candidateSha,
    shaMatchesCandidate,
    deployProof: shaMatchesCandidate ? "ESTE_SHA" : "NAO_E_O_SHA_CANDIDATO",
    login,
    results,
  };
}

function storedBody(probeId, text) {
  if (probeId === "E2E-META") {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify({
        stage: parsed.stage ?? null,
        sourceSha: parsed.sourceSha ?? null,
        contractVersion: parsed.contractVersion ?? null,
      });
    } catch {
      return text.slice(0, 180);
    }
  }
  return text.slice(0, 420);
}

function readJsonField(body, field) {
  try {
    const parsed = JSON.parse(body);
    const value = parsed?.[field];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
