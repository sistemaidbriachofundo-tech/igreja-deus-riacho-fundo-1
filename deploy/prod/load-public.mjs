#!/usr/bin/env node
/**
 * Carga leitura-only em produção (sem login, sem POST, sem escrita no banco).
 * Simula N usuários com pool de concorrência (padrão seguro p/ shared hosting).
 *
 * Uso:
 *   node deploy/prod/load-public.mjs
 *   node deploy/prod/load-public.mjs --users 400 --concurrency 40 --rounds 1
 *
 * NÃO use --concurrency 400 no apex Hostinger compartilhado: derruba o edge (ECONNRESET).
 */
const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  return args[i + 1] ?? def;
}

const USERS = Number(flag("users", "400"));
const ROUNDS = Number(flag("rounds", "1"));
const TIMEOUT_MS = Number(flag("timeout", "20000"));
/** Máx. sessões em voo. Padrão 40 — seguro no LiteSpeed compartilhado. */
const CONCURRENCY = Number(flag("concurrency", "40"));
const RAMP_MS = Number(flag("ramp-ms", "25"));
const FAIL_ABORT_PCT = Number(flag("abort-pct", "10"));
const SITE = process.env.PROD_SITE_URL || "https://igrejadeusrf1.com.br";
const API = process.env.PROD_API_URL || "https://api.igrejadeusrf1.com.br";
const UA = "idbrf-prod-load/1.1";

const TARGETS = [
  { name: "site_home", url: `${SITE}/` },
  { name: "site_login", url: `${SITE}/login/` },
  { name: "site_release", url: `${SITE}/release.json` },
  { name: "api_ready", url: `${API}/ready` },
  { name: "api_health", url: `${API}/health` },
];

const samples = [];
let abortAll = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapPool(items, limit, fn) {
  const ret = new Array(items.length);
  let next = 0;
  async function worker() {
    while (!abortAll && next < items.length) {
      const i = next++;
      if (RAMP_MS > 0) await sleep(RAMP_MS);
      ret[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return ret;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function errLabel(e) {
  if (e?.name === "TimeoutError" || e?.cause?.name === "TimeoutError") return "timeout";
  return e?.cause?.code || e?.code || "network";
}

async function hit(target, userId, round) {
  const started = performance.now();
  let status = 0;
  let ok = false;
  let err = "";
  try {
    const res = await fetch(target.url, {
      redirect: "follow",
      headers: { "user-agent": UA, "x-load-user": String(userId), "x-load-round": String(round) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    await res.arrayBuffer();
    ok = status >= 200 && status < 400 && status !== 403;
  } catch (e) {
    err = errLabel(e);
  }
  const ms = Math.round(performance.now() - started);
  samples.push({ name: target.name, status, ok, ms, err, userId, round });
  return ok;
}

async function userSession(userId, round) {
  if (abortAll) return;
  for (const t of TARGETS) {
    if (abortAll) return;
    await hit(t, userId, round);
  }
}

async function runRound(round) {
  const ids = Array.from({ length: USERS }, (_, i) => i + 1);
  await mapPool(ids, CONCURRENCY, (userId) => userSession(userId, round));
}

function summarize() {
  const byName = new Map();
  for (const s of samples) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }

  const summary = {};
  const total = samples.length;
  const okCount = samples.filter((s) => s.ok).length;
  const failCount = total - okCount;

  for (const [name, list] of byName) {
    const times = list.map((s) => s.ms).sort((a, b) => a - b);
    const statuses = {};
    for (const s of list) {
      const key = s.err || String(s.status);
      statuses[key] = (statuses[key] || 0) + 1;
    }
    const fails = list.filter((s) => !s.ok).length;
    summary[name] = {
      requests: list.length,
      ok: list.length - fails,
      fail: fails,
      failRate: Number(((fails / list.length) * 100).toFixed(2)),
      p50_ms: percentile(times, 50),
      p95_ms: percentile(times, 95),
      p99_ms: percentile(times, 99),
      max_ms: times[times.length - 1] ?? null,
      statuses,
    };
  }

  return {
    ok: failCount === 0,
    users: USERS,
    concurrency: CONCURRENCY,
    rounds: ROUNDS,
    totalRequests: total,
    okRequests: okCount,
    failRequests: failCount,
    failRatePct: Number(((failCount / Math.max(total, 1)) * 100).toFixed(2)),
    targets: summary,
  };
}

if (CONCURRENCY > 80) {
  console.error(
    `AVISO: concurrency=${CONCURRENCY} pode derrubar o apex compartilhado. Preferir <=40.`,
  );
}

console.error(
  JSON.stringify({
    starting: true,
    users: USERS,
    concurrency: CONCURRENCY,
    rampMs: RAMP_MS,
    rounds: ROUNDS,
    requestsPerUser: TARGETS.length,
    totalPlanned: USERS * ROUNDS * TARGETS.length,
    mode: "read-only",
    site: SITE,
    api: API,
  }),
);

const t0 = performance.now();
for (let r = 1; r <= ROUNDS; r++) {
  console.error(`round ${r}/${ROUNDS} — ${USERS} usuários (pool ${CONCURRENCY})…`);
  await runRound(r);
  const partialFails = samples.filter((s) => !s.ok).length;
  const rate = partialFails / Math.max(samples.length, 1);
  if (rate > FAIL_ABORT_PCT / 100) {
    abortAll = true;
    console.error(
      `ABORT: taxa de falha ${(rate * 100).toFixed(1)}% > ${FAIL_ABORT_PCT}% — parando para proteger produção.`,
    );
    break;
  }
}
const elapsedMs = Math.round(performance.now() - t0);
const report = { ...summarize(), elapsedMs, aborted: abortAll };

console.log(JSON.stringify(report, null, 2));
process.exit(report.failRequests === 0 ? 0 : 2);
