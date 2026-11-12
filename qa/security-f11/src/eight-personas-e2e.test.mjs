import assert from "node:assert/strict";
import test from "node:test";
import { PERSONAS, QA_ORIGIN, assertQaSafety, totp } from "./eight-personas-e2e.mjs";

test("o catálogo contém as oito personas esperadas", () => {
  assert.deepEqual(PERSONAS.map(p => p.id), [
    "admin", "secretaria", "pastor", "tesouraria", "lider", "membro", "editor", "publicador",
  ]);
  assert.equal(PERSONAS.filter(p => p.privileged).length, 7);
  assert.equal(QA_ORIGIN, "https://id-riacho1-api-qa.vercel.app");
});
test("o algoritmo TOTP reproduz o vetor RFC 6238 de 59 segundos (6 dígitos)", () => {
  assert.equal(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000), "287082");
});
test("protege QA contra testes sem autorização", () => {
  assert.throws(() => assertQaSafety({ QA_DEMO_PASSWORD: "x" }), /QA_ALLOW_AUTH_TESTS/);
  assert.throws(() => assertQaSafety({ QA_ALLOW_AUTH_TESTS: "yes" }), /QA_DEMO_PASSWORD/);
  assert.throws(() => assertQaSafety({
    QA_ALLOW_AUTH_TESTS: "yes", QA_DEMO_PASSWORD: "synthetic",
    QA_API_BASE_URL: "https://id-riacho1-api-hml.vercel.app",
  }), /Proibido/);
  assert.doesNotThrow(() => assertQaSafety({
    QA_ALLOW_AUTH_TESTS: "yes", QA_DEMO_PASSWORD: "synthetic",
    QA_API_BASE_URL: QA_ORIGIN,
  }));
});
