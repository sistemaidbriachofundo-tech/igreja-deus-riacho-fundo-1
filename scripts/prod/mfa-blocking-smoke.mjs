#!/usr/bin/env node
/**
 * Prova operacional: GET /ready deve declarar mfaBlocking=true.
 * Uso: node scripts/prod/mfa-blocking-smoke.mjs [API_BASE]
 * Ex.: node scripts/prod/mfa-blocking-smoke.mjs https://api.igrejadeusrf1.com.br
 */
const base = (process.argv[2] || process.env.API_BASE || "https://api.igrejadeusrf1.com.br").replace(/\/$/, "");

const res = await fetch(`${base}/ready`, {
  headers: { "user-agent": "idbrf-mfa-blocking-smoke/1.0" },
  signal: AbortSignal.timeout(20000),
});
const body = await res.json().catch(() => ({}));
const ok = res.status === 200 && body.status === "ready" && body.mfaBlocking === true;

console.log(
  JSON.stringify(
    {
      ok,
      api: base,
      http: res.status,
      status: body.status ?? null,
      mfaBlocking: body.mfaBlocking ?? null,
      database: body.database ?? null,
      next: ok
        ? "Rodar eight-personas-e2e com QA_ALLOW_AUTH_TESTS=yes no ambiente isolado."
        : "Defina F11_MFA_BLOCKING=true e AUTH_STATE_STORE=prisma neste ambiente.",
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 2);
