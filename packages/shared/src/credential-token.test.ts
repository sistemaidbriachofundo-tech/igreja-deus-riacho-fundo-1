import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertOpaqueCredentialPayload,
  containsSensitiveCredentialPayload,
  generateOpaqueCredentialToken,
  isOpaqueCredentialToken,
  OPAQUE_TOKEN_BYTES,
} from "./credential-token";

describe("credential opaque token", () => {
  it("generates high-entropy base64url without PII markers", () => {
    const token = generateOpaqueCredentialToken();
    assert.equal(typeof token, "string");
    assert.ok(token.length >= 40);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.equal(containsSensitiveCredentialPayload(token), false);
    assert.equal(isOpaqueCredentialToken(token), true);
  });

  it("uses at least 32 bytes by default", () => {
    assert.ok(OPAQUE_TOKEN_BYTES >= 32);
    const a = generateOpaqueCredentialToken();
    const b = generateOpaqueCredentialToken();
    assert.notEqual(a, b);
  });

  it("rejects CPF / phone / email in QR payload", () => {
    assert.equal(containsSensitiveCredentialPayload("123.456.789-09"), true);
    assert.equal(containsSensitiveCredentialPayload("cpf:12345678909"), true);
    assert.equal(containsSensitiveCredentialPayload("(61) 98888-7777"), true);
    assert.equal(containsSensitiveCredentialPayload("membro@example.test"), true);
    assert.equal(
      containsSensitiveCredentialPayload(
        JSON.stringify({ cpf: "12345678909", phone: "61988887777" }),
      ),
      true,
    );
  });

  it("assertOpaqueCredentialPayload throws on sensitive data", () => {
    assert.throws(() => assertOpaqueCredentialPayload("11987654321"), /PII|CPF|telefone/i);
    const ok = generateOpaqueCredentialToken();
    assert.doesNotThrow(() => assertOpaqueCredentialPayload(ok));
  });

  it("QR payload must not embed person fields", () => {
    const fakeQr = JSON.stringify({
      personId: "demoPersonMembro01",
      cpf: "000.000.000-00",
      telefone: "61 99999-0000",
    });
    assert.equal(isOpaqueCredentialToken(fakeQr), false);
    assert.equal(containsSensitiveCredentialPayload(fakeQr), true);
  });
});
