import assert from "node:assert/strict";
import test from "node:test";
import {
  DISPOSABLE_DB,
  SEEDED,
  assertDisposableTarget,
  assertReportSafe,
  classifyHostedApi,
  classifyHostedWeb,
  ephemeralPassword,
  interpretExemptLogin,
  interpretPrivilegedLogin,
  tokenFromPreview,
} from "./disposable-persona-auth.mjs";

const localEnv = {
  QA_API_BASE_URL: "http://127.0.0.1:3011",
  DATABASE_URL: "postgresql://idbrf:idbrf_dev_only@127.0.0.1:5432/idbrf_e2e_auth?schema=public",
  IDBRF_RUNTIME_STAGE: "qa",
};

test("o catálogo cobre as oito personas do seed, com MFA nos papéis privilegiados", () => {
  assert.equal(DISPOSABLE_DB, "idbrf_e2e_auth");
  assert.deepEqual(SEEDED.map((persona) => persona.id), [
    "ADMIN", "PASTOR", "SECRETARIA", "TESOURARIA", "LIDER_MINISTERIO", "MEMBRO", "EDITOR", "PUBLICADOR",
  ]);
  assert.equal(SEEDED.filter((persona) => persona.mfa).length, 7);
  assert.equal(SEEDED.find((persona) => persona.id === "MEMBRO").mfa, false);
  assert.equal(SEEDED.every((persona) => persona.email.endsWith("@example.test")), true);
});

test("recusa API remota e banco que não seja o descartável local", () => {
  assert.doesNotThrow(() => assertDisposableTarget(localEnv));
  assert.throws(() => assertDisposableTarget({
    ...localEnv,
    QA_API_BASE_URL: "https://id-riacho1-api-qa.vercel.app",
  }), /loopback/);
  assert.throws(() => assertDisposableTarget({
    ...localEnv,
    DATABASE_URL: "postgresql://idbrf:segredo@ep-example.neon.tech:5432/idbrf_e2e_auth",
  }), /local|compartilhada/);
  assert.throws(() => assertDisposableTarget({
    ...localEnv,
    DATABASE_URL: "postgresql://idbrf:idbrf_dev_only@127.0.0.1:5432/idriacho1_hml",
  }), /idbrf_e2e_auth/);
  assert.throws(() => assertDisposableTarget({ ...localEnv, IDBRF_RUNTIME_STAGE: "production" }), /Produção/);
});

test("não trata JWT antecipado como sessão privilegiada válida", () => {
  assert.equal(interpretPrivilegedLogin(200, { accessToken: "jwt" }).status, "FAIL");
  assert.equal(interpretPrivilegedLogin(201, { mfa: { challengeId: "abc" } }).status, "PASS");
  assert.equal(interpretPrivilegedLogin(401, {}).status, "FAIL");
  assert.equal(interpretExemptLogin(201, { accessToken: "jwt", mfa: { required: false } }).status, "PASS");
  assert.equal(interpretExemptLogin(200, { mfa: { challengeId: "abc" } }).status, "FAIL");
});

test("o site hospedado atrás do SSO fica bloqueado, sem senha", () => {
  const web = classifyHostedWeb(302, "https://vercel.com/login", "");
  assert.equal(web.status, "BLOCKED");
  assert.match(web.detail, /SSO/);
  assert.match(web.detail, /nenhuma credencial foi transmitida/i);
  const api = classifyHostedApi(200, { database: "ok", mfaBlocking: true }, 401);
  assert.equal(api.status, "BLOCKED");
  assert.match(api.detail, /mfaBlocking=true/);
  assert.match(api.detail, /Nenhuma credencial foi transmitida/);
});

test("o link de convite só é aceito como token opaco de 43 caracteres", () => {
  const token = "a".repeat(43);
  assert.equal(tokenFromPreview(`https://dev.example.test/ativar-acesso/#token=${token}`), token);
  assert.equal(tokenFromPreview("http://dev.example.test/ativar-acesso/#token=" + token), null);
  assert.equal(tokenFromPreview("https://dev.example.test/ativar-acesso/#token=curto"), null);
});

test("senha efêmera cumpre a política e o relatório recusa segredo", () => {
  const password = ephemeralPassword();
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /\d/);
  assert.equal(password.length >= 14, true);
  assert.equal(/\s|admin|senha|password|igreja|riacho/i.test(password), false);
  assert.throws(() => assertReportSafe(`sessao ${password}`, [password]), /segredo/);
  assert.throws(() => assertReportSafe("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura", []), /JWT/);
  assert.doesNotThrow(() => assertReportSafe("PASS sem segredo", [password]));
});
