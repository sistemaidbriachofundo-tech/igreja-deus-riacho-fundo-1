/**
 * E2E de oito personas SOMENTE na API QA com contas sintéticas.
 * Executa login, desafio/enrollment MFA, /auth/me, logout e revogação.
 * Nenhum e-mail, token, senha ou segredo TOTP é impresso.
 *
 * QA_ALLOW_AUTH_TESTS=yes QA_DEMO_PASSWORD=... node qa/security-f11/src/eight-personas-e2e.mjs
 * QA_ALLOW_MFA_ENROLL=yes autoriza registrar TOTP apenas em usuários fictícios do QA.
 * QA_F11_TOTP_SECRETS_JSON='{"admin":"..."}' alimenta os fatores já cadastrados.
 * Nunca executar com dados pessoais reais, em HML compartilhada ou em produção.
 */
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const QA_ORIGIN = "https://id-riacho1-api-qa.vercel.app";
export const PERSONAS = Object.freeze([
  { id: "admin", email: "platform.demo@example.test", role: "PLATFORM_ADMIN", privileged: true },
  { id: "secretaria", email: "ana.demo@example.test", role: "SECRETARIA", privileged: true },
  { id: "pastor", email: "pastor.demo@example.test", role: "PASTOR", privileged: true },
  { id: "tesouraria", email: "tesouraria.demo@example.test", role: "TESOURARIA", privileged: true },
  { id: "lider", email: "lider.jovens.demo@example.test", role: "LIDER_MINISTERIO", privileged: true },
  { id: "membro", email: "bruno.demo@example.test", role: "MEMBRO", privileged: false },
  { id: "editor", email: "editor.demo@example.test", role: "EDITOR_SITE", privileged: true },
  { id: "publicador", email: "publicador.demo@example.test", role: "PUBLICADOR_SITE", privileged: true },
]);

export function totp(secret, now = Date.now()) {
  if (!/^[A-Z2-7]+=*$/i.test(secret)) throw new Error("TOTP não é base32 válido");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secret.replace(/=+$/, "").toUpperCase();
  let bits = 0, value = 0, bytes = [];
  for (const ch of cleaned) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 0xff); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, "0");
}

async function post(path, body, fetchImpl) {
  const response = await fetchImpl(QA_ORIGIN + path, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
  });
  let value = {};
  try { value = await response.json(); } catch { /* status ainda é significativo */ }
  return { status: response.status, data: value };
}
async function get(path, token, fetchImpl) {
  const response = await fetchImpl(QA_ORIGIN + path, {
    method: "GET", redirect: "manual",
    headers: { accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    signal: AbortSignal.timeout(12000),
  });
  let value = {};
  try { value = await response.json(); } catch { /* status ainda é significativo */ }
  return { status: response.status, data: value };
}

export function assertQaSafety(env) {
  if (env.QA_ALLOW_AUTH_TESTS !== "yes") throw new Error("A execução de autenticação exige QA_ALLOW_AUTH_TESTS=yes");
  if (!env.QA_DEMO_PASSWORD || env.QA_DEMO_PASSWORD.length < 1)
    throw new Error("Configure QA_DEMO_PASSWORD em um segredo do CI; nunca no repositório");
  if (env.QA_API_BASE_URL && env.QA_API_BASE_URL.replace(/\/$/, "") !== QA_ORIGIN)
    throw new Error("Proibido executar contra outra URL de API");
}

export async function runEightPersonas(env = process.env, fetchImpl = fetch) {
  assertQaSafety(env);
  const ready = await get("/ready", null, fetchImpl);
  if (ready.status !== 200 || ready.data.database !== "ok" ||
      ready.data.authState !== "prisma" || ready.data.mfaBlocking !== true) {
    throw new Error("QA não está pronta com sessão persistida e MFA obrigatório: nenhum login executado");
  }
  const secrets = env.QA_F11_TOTP_SECRETS_JSON ? JSON.parse(env.QA_F11_TOTP_SECRETS_JSON) : {};
  const rows = [];
  for (const p of PERSONAS) {
    try {
      const signed = await post("/auth/login", { email: p.email, password: env.QA_DEMO_PASSWORD }, fetchImpl);
      if (signed.status === 401) { rows.push({ persona: p.id, result: "BLOCKED", reason: "Conta sintética ausente ou credencial QA diferente" }); continue; }
      if (signed.status >= 400) { rows.push({ persona: p.id, result: "FAIL", reason: "Login HTTP " + signed.status }); continue; }
      let authenticated = signed.data;
      const challenge = signed.data.mfa;
      if (p.privileged && signed.data.accessToken) {
        rows.push({ persona: p.id, result: "FAIL", reason: "JWT privilegiado emitido antes do segundo fator" }); continue;
      }
      if (p.privileged && !challenge?.challengeId) {
        rows.push({ persona: p.id, result: "FAIL", reason: "Desafio MFA não retornado" }); continue;
      }
      if (challenge?.challengeId) {
        let secret = secrets[p.id];
        if (challenge.enrollmentRequired) {
          if (env.QA_ALLOW_MFA_ENROLL !== "yes") {
            rows.push({ persona: p.id, result: "BLOCKED", reason: "Enrollment exige autorização QA_ALLOW_MFA_ENROLL=yes" }); continue;
          }
          const started = await post("/auth/mfa/enroll", { challengeId: challenge.challengeId }, fetchImpl);
          if (started.status >= 400 || !started.data.secret) {
            rows.push({ persona: p.id, result: "FAIL", reason: "Enrollment falhou" }); continue;
          }
          secret = started.data.secret;
        }
        if (!secret) {
          rows.push({ persona: p.id, result: "BLOCKED", reason: "Falta segredo TOTP da conta fictícia no CI" }); continue;
        }
        const endpoint = challenge.enrollmentRequired ? "/auth/mfa/enroll/confirm" : "/auth/mfa/challenge";
        const verified = await post(endpoint, { challengeId: challenge.challengeId, code: totp(secret) }, fetchImpl);
        if (verified.status >= 400 || !verified.data.accessToken) {
          rows.push({ persona: p.id, result: "FAIL", reason: "Código TOTP recusado" }); continue;
        }
        authenticated = verified.data;
        // O desafio de uso único jamais pode emitir segunda sessão.
        const replay = await post(endpoint, { challengeId: challenge.challengeId, code: totp(secret) }, fetchImpl);
        if (replay.status !== 401) {
          rows.push({ persona: p.id, result: "FAIL", reason: "Replay do desafio não foi recusado" }); continue;
        }
      }
      if (!authenticated.accessToken) {
        rows.push({ persona: p.id, result: "FAIL", reason: "Nenhum JWT após autenticação" }); continue;
      }
      const me = await get("/auth/me", authenticated.accessToken, fetchImpl);
      if (me.status !== 200 || !Array.isArray(me.data.grants) ||
          !me.data.grants.some(g => g.roleCode === p.role)) {
        rows.push({ persona: p.id, result: "FAIL", reason: "JWT inválido ou papel incorreto" }); continue;
      }
      const logout = await fetchImpl(QA_ORIGIN + "/auth/logout", {
        method: "POST", redirect: "manual",
        headers: { Authorization: "Bearer " + authenticated.accessToken },
        signal: AbortSignal.timeout(12000),
      });
      const revoked = await get("/auth/me", authenticated.accessToken, fetchImpl);
      if (logout.status >= 400 || revoked.status !== 401) {
        rows.push({ persona: p.id, result: "FAIL", reason: "Sessão não revogada após logout" }); continue;
      }
      rows.push({ persona: p.id, result: "PASS" });
    } catch (error) {
      rows.push({ persona: p.id, result: "FAIL", reason: "Falha de transporte (" + (error?.name ?? "Error") + ")" });
    }
  }
  return { api: QA_ORIGIN, sourceSha: ready.data.commit ?? null, checked: rows.length,
    verdict: rows.every(r => r.result === "PASS") ? "PASS" : "NO_GO", rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await runEightPersonas();
    console.log(JSON.stringify(report, null, 2));
    if (report.verdict !== "PASS") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "QA não autorizada");
    process.exitCode = 2;
  }
}
