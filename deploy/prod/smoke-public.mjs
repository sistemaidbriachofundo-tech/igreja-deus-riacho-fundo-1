#!/usr/bin/env node
/**
 * Smoke produção: portal + API. Falha em 403/5xx ou release inconsistente.
 * Uso: node deploy/prod/smoke-public.mjs [expectedSha]
 */
const expectedSha = process.argv[2] || "";
const SITE = process.env.PROD_SITE_URL || "https://igrejadeusrf1.com.br";
const API = process.env.PROD_API_URL || "https://api.igrejadeusrf1.com.br";

async function get(url) {
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "idbrf-prod-smoke/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

function fail(msg) {
  console.error(`SMOKE_FAIL: ${msg}`);
  process.exit(1);
}

const site = await get(`${SITE}/`);
if (site.status === 403) fail("portal 403 — document root sem index/out errado");
if (site.status < 200 || site.status >= 400) fail(`portal HTTP ${site.status}`);
if (site.text.includes("/igreja-deus-riacho-fundo-1/_next")) {
  fail("portal servindo basePath do GitHub Pages no apex");
}
if (!/Igreja de Deus/i.test(site.text)) fail("portal sem título/marca esperada");

const release = await get(`${SITE}/release.json`);
if (release.status === 200) {
  let body;
  try {
    body = JSON.parse(release.text);
  } catch {
    fail("release.json inválido");
  }
  if (body.basePath) fail(`release.basePath=${body.basePath}`);
  if (expectedSha && body.sourceSha && !String(body.sourceSha).startsWith(expectedSha)) {
    fail(`release.sourceSha ${body.sourceSha} ≠ ${expectedSha}`);
  }
}

const ready = await get(`${API}/ready`);
if (ready.status !== 200) fail(`API /ready HTTP ${ready.status}`);
let readyBody;
try {
  readyBody = JSON.parse(ready.text);
} catch {
  fail("API /ready JSON inválido");
}
if (readyBody.status !== "ready" || readyBody.database !== "ok") {
  fail(`API not ready: ${ready.text.slice(0, 200)}`);
}

const login = await get(`${SITE}/login/`);
if (login.status < 200 || login.status >= 400) fail(`login HTTP ${login.status}`);

console.log(
  JSON.stringify({
    ok: true,
    site: SITE,
    api: API,
    siteStatus: site.status,
    apiReady: readyBody.status,
    releaseSha: release.status === 200 ? JSON.parse(release.text).sourceSha : null,
  }),
);
