import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMailtoUrl,
  buildWhatsAppUrl,
  containsEmailAddress,
  normalizeWhatsAppDigits,
  rosterInviteWhatsAppText,
} from "./contact-deep-links";

describe("contact-deep-links", () => {
  it("encontra e-mail em texto livre com domínios compostos e espaços", () => {
    assert.equal(containsEmailAddress("Fale com Ana <ana+convite@example.test.br>"), true);
    assert.equal(containsEmailAddress("nome @example.test ou ana@example."), false);
    assert.equal(containsEmailAddress("@example.test dia da reunião"), false);
    assert.equal(containsEmailAddress("x".repeat(50_000) + "@sem-ponto"), false);
  });

  it("normalizes BR mobile with DDI 55", () => {
    assert.equal(normalizeWhatsAppDigits("(61) 99999-8888"), "5561999998888");
    assert.equal(normalizeWhatsAppDigits("5561999998888"), "5561999998888");
    assert.equal(normalizeWhatsAppDigits("123"), null);
  });

  it("builds wa.me with and without phone", () => {
    assert.equal(
      buildWhatsAppUrl({ phone: "61999998888", text: "Olá" }),
      "https://wa.me/5561999998888?text=Ol%C3%A1",
    );
    assert.equal(buildWhatsAppUrl({ text: "Convite" }), "https://wa.me/?text=Convite");
    assert.equal(buildWhatsAppUrl({}), "https://wa.me/");
  });

  it("builds mailto only with valid email", () => {
    assert.equal(buildMailtoUrl({ email: "a@example.test", subject: "Oi" }), "mailto:a@example.test?subject=Oi");
    assert.equal(buildMailtoUrl({ email: "sem-arroba" }), null);
  });

  it("composes roster invite text", () => {
    const text = rosterInviteWhatsAppText({
      personName: "Ana",
      ministryName: "Atmosfera",
      serviceLabel: "domingo 10h",
      roleLabel: "Recepção",
    });
    assert.match(text, /Ana/);
    assert.match(text, /Atmosfera/);
    assert.match(text, /Recepção/);
  });
});
