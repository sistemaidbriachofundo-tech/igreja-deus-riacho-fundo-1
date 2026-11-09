import assert from "node:assert/strict";
import test from "node:test";
import {
  blockedResult,
  contrastSeverity,
  targetSeverity,
  verdictFromFindings,
  worstSeverity,
} from "./classify.mjs";

test("P0 ou P1 reprovam o caso e P2 sozinho não reprova", () => {
  assert.equal(verdictFromFindings([{ severity: "P2" }]), "PASS");
  assert.equal(verdictFromFindings([{ severity: "P1" }]), "FAIL");
  assert.equal(verdictFromFindings([{ severity: "P0" }, { severity: "P2" }]), "FAIL");
  assert.equal(worstSeverity([{ severity: "P2" }, { severity: "P1" }]), "P1");
});

test("contraste abaixo do limiar em texto principal é P1", () => {
  assert.equal(contrastSeverity({ ratio: 1.8, minimum: 4.5, role: "body" }), "P1");
  assert.equal(contrastSeverity({ ratio: 5, minimum: 4.5, role: "body" }), null);
  assert.equal(contrastSeverity({ ratio: 3.2, minimum: 4.5, role: "meta" }), "P2");
});

test("alvo abaixo de 24 px em botão é P1 e entre 24 e 44 é P2", () => {
  assert.equal(targetSeverity(20, "button"), "P1");
  assert.equal(targetSeverity(40, "button"), "P2");
  assert.equal(targetSeverity(44, "input"), null);
  assert.equal(targetSeverity(20, "link"), null);
});

test("caso bloqueado não vira PASS", () => {
  const result = blockedResult({
    id: "UX-08",
    area: "Pastor",
    surface: "Dashboard",
    profile: "PASTOR",
    route: null,
    reason: "Não há página de dashboard do pastor na main integrada.",
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.findings.length, 0);
});
