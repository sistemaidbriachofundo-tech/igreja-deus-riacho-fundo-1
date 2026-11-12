import { spawnSync } from "node:child_process";

const production = process.env.IDBRF_PRODUCTION_API_ORIGIN;
const web = process.env.IDBRF_PRODUCTION_WEB_ORIGIN;
const nonProduction = /(?:^|[._-])(?:hml|qa|demo|preview|sandbox|localhost|test)(?:[._-]|$)/i;
const sha = process.env.IDBRF_PRODUCTION_API_SHA ?? "";
const failures = [];

function origin(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && url.origin === raw && !nonProduction.test(url.hostname)) return url.origin;
  } catch {
    return null;
  }
  return null;
}

if (
  typeof production === "string" && /id-riacho1-api-hml\.vercel\.app|github\.io/i.test(production) ||
  typeof web === "string" && /id-riacho1-api-hml\.vercel\.app|github\.io/i.test(web)
) {
  failures.push("A origem informada é o site ou a API de homologação atuais. Este preflight não libera produção.");
}
if (!origin(production) || !origin(web)) {
  failures.push("Informe as origens HTTPS do site e da API de produção, separadas da homologação.");
}
if (!/^[a-f0-9]{40}$/.test(sha)) failures.push("Informe o SHA completo da API candidata.");
if (failures.length === 0) {
  try {
    const options = { redirect: "error", signal: AbortSignal.timeout(12_000) };
    const [meta, ready, privateRoute] = await Promise.all([
      fetch(production + "/meta", options),
      fetch(production + "/ready", options),
      fetch(production + "/auth/me", options),
    ]);
    const identity = meta.ok ? await meta.json() : null;
    const readiness = ready.ok ? await ready.json() : null;
    if (identity?.stage !== "production" || identity?.sourceSha !== sha) failures.push("A API respondeu com ambiente ou versão diferente do esperado.");
    if (readiness?.status !== "ready" || readiness?.database !== "ok") failures.push("A API não confirmou acesso ao banco.");
    if (privateRoute.status !== 401) failures.push("A API não confirmou que a rota de sessão exige autenticação.");

    const cors = await fetch(production + "/auth/login", {
      ...options,
      method: "OPTIONS",
      headers: { Origin: web, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    if (!cors.ok || cors.headers.get("access-control-allow-origin") !== web) {
      failures.push("A API não autorizou o endereço do portal para login.");
    }
  } catch {
    failures.push("A API candidata não pôde ser verificada por HTTPS.");
  }
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const audit = spawnSync(npm, ["audit", "--omit=dev", "--audit-level=high", "--json"], {
  encoding: "utf8",
  timeout: 60_000,
});
try {
  const result = JSON.parse(audit.stdout);
  const counts = result.metadata?.vulnerabilities;
  if (!counts) failures.push("Auditoria de dependências indisponível.");
  else if (counts.high || counts.critical) failures.push("Há alertas altos ou críticos no lockfile de execução.");
} catch {
  failures.push("Auditoria de dependências indisponível.");
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log("Pré-verificação de rede, API, banco e dependências concluída. Consulte o roteiro de liberação para os testes autenticados e a restauração.");
}
