import assert from "node:assert/strict";
import test from "node:test";
import { assertStubPassword, corsHeaders, createSessionToken } from "./synthetic-auth-policy.mjs";

test("só libera CORS de loopback e nunca reflete origem arbitrária", () => {
  assert.equal(corsHeaders("http://127.0.0.1:3000")["Access-Control-Allow-Origin"], "http://127.0.0.1:3000");
  assert.equal(corsHeaders("http://localhost:3000")["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.deepEqual(corsHeaders("https://evil.example"), {});
  assert.deepEqual(corsHeaders(undefined), {});
  assert.equal(JSON.stringify(corsHeaders("http://127.0.0.1:3000")).includes("*"), false);
});

test("recusa senha curta ou pública e emite token imprevisível", () => {
  assert.throws(() => assertStubPassword(""), /STUB_PASSWORD/);
  assert.throws(() => assertStubPassword("sintetica-local"), /STUB_PASSWORD/);
  assert.throws(() => assertStubPassword("admin"), /STUB_PASSWORD/);
  assert.equal(assertStubPassword("homologacao-local-apenas"), "homologacao-local-apenas");
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.ok(first.length > 20);
  assert.equal(/token-secretaria|token-lider|expire-me/.test(first), false);
});
