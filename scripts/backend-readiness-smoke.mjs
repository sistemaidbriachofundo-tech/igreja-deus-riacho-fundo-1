#!/usr/bin/env node
/**
 * Checagem não destrutiva de uma API HML já provisionada.
 * Uso: API_BASE=https://api-hml.exemplo.org npm run homolog:readiness
 * Não usa senha, não modifica dados e não autentica com usuário real.
 */
const raw = process.env.API_BASE?.trim();
if (!raw) {
  console.error("Defina API_BASE para a URL HML aprovada; nenhuma API foi testada.");
  process.exit(2);
}
let base;
try {
  base = new URL(raw);
} catch {
  console.error("API_BASE inválida");
  process.exit(2);
}
if (base.protocol !== "https:" &&
  !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
  console.error("API_BASE deve ser HTTPS fora do localhost");
  process.exit(2);
}
if (base.username || base.password || base.search || base.hash) {
  console.error("API_BASE não deve conter credenciais ou parâmetros");
  process.exit(2);
}
const root = base.href.replace(/\/$/, "");

async function get(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(root + path, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    let json = null;
    try { json = await response.json(); } catch { /* HTTP status is decisive */ }
    return { status: response.status, json };
  } finally { clearTimeout(timer); }
}

async function main() {
  const checks = [
    { path: "/health", accept: r => r.status === 200 && r.json?.status === "ok" },
    { path: "/ready", accept: r => r.status === 200 && r.json?.status === "ready" && r.json?.database === "ok" },
    { path: "/meta", accept: r => r.status === 200 && typeof r.json?.contractVersion === "string" },
    { path: "/auth/me", accept: r => r.status === 401 },
  ];
  let errors = 0;
  for (const check of checks) {
    try {
      const response = await get(check.path);
      const ok = check.accept(response);
      console.log((ok ? "PASS" : "FAIL") + " " + check.path + " HTTP " + response.status);
      if (!ok) errors++;
    } catch {
      console.error("FAIL " + check.path + " (sem resposta válida)");
      errors++;
    }
  }
  if (errors) {
    console.error("HML NÃO HOMOLOGADA: " + errors + " verificação(ões) falharam.");
    process.exitCode = 1;
  } else {
    console.log("API HML: smoke de liveness/readiness/meta/autorização aprovado.");
  }
}
void main().catch(() => { console.error("HML NÃO HOMOLOGADA"); process.exitCode = 1; });
