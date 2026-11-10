import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_ROUTES, CHECKS, PERSONAS, VIEWPORTS, checksByGroup } from "./catalog.mjs";

test("cobre 26 portas, 6 UX já nomeados e 18 hipóteses", () => {
  assert.equal(checksByGroup("SG").length, 26);
  assert.equal(checksByGroup("UX").length, 6);
  assert.equal(checksByGroup("UX-V").length, 18);
  assert.equal(CHECKS.length, 50);
  assert.equal(new Set(CHECKS.map((check) => check.id)).size, 50);
});

test("oito personas e a matriz de rotas", () => {
  assert.equal(PERSONAS.length, 8);
  assert.equal(PERSONAS.filter((persona) => persona.seeded).length, 7);
  assert.equal(PERSONAS.find((persona) => persona.id === "PUBLICADOR")?.seeded, false);
  assert.equal(AUTH_ROUTES.length, 8);
  assert.deepEqual(VIEWPORTS, [320, 360, 390, 768, 1024, 1440, 1920]);
});
