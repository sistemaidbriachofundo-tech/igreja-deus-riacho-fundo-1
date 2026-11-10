import assert from "node:assert/strict";
import test from "node:test";
import {
  anonymousStatusVerdict,
  applyUserModeRule,
  jargonHits,
  missingChecks,
  publicNavVerdict,
  redact,
  releaseDecision,
  treasuryPresentation,
  userModeHttpLeak,
} from "./verdict.mjs";
import { CHECKS } from "./catalog.mjs";

test("redige segredo e não deixa 501 visível como PASS", () => {
  assert.match(redact("Authorization: Bearer eyJaaa.bbb.ccc"), /\[redigido\]|\[jwt-redigido\]/);
  assert.deepEqual(userModeHttpLeak("O vínculo responde 501 nesta tela"), ["501"]);
  const row = applyUserModeRule(
    { id: "UX-V18", status: "PASS", severity: null, detail: "A tela abriu." },
    "Operação 501 disponível",
  );
  assert.equal(row.status, "FAIL");
  assert.equal(row.severity, "P1");
  assert.match(row.detail, /501/);
});

test("menu público e 401 anônimo", () => {
  assert.equal(publicNavVerdict(["Início", "Quem somos", "Agenda", "Login"]).status, "PASS");
  assert.equal(publicNavVerdict(["Início", "Quem somos", "Agenda", "Login", "Ministérios"]).status, "FAIL");
  assert.equal(anonymousStatusVerdict([{ path: "/auth/me", status: 401 }]).status, "PASS");
  assert.equal(anonymousStatusVerdict([{ path: "/persons/search", status: 200 }]).severity, "P0");
  assert.equal(anonymousStatusVerdict([{ path: "/ministries", status: 501 }]).status, "FAIL");
});

test("jargão, tesouraria ilustrada e decisão de release", () => {
  assert.ok(jargonHits("Demonstração com roster e endpoint").includes("demo"));
  assert.ok(jargonHits("Demonstração com roster e endpoint").includes("roster"));
  assert.equal(jargonHits("Ambiente de homologação").length, 0);
  const treasury = treasuryPresentation("Sem consulta. Ilustração do contrato R$ 100,00");
  assert.equal(treasury.status, "FAIL");
  assert.equal(treasury.severity, "P1");
  const decision = releaseDecision([
    { status: "FAIL", severity: "P1", critical: true },
    { status: "BLOCKED", severity: null, critical: true },
  ]);
  assert.equal(decision.approved, false);
  assert.equal(decision.label, "NÃO APROVADA");
  assert.equal(releaseDecision([{ status: "PASS", severity: null, critical: true }]).approved, true);
});

test("catálogo completo entra na conferência de execução", () => {
  assert.deepEqual(missingChecks(CHECKS, []), CHECKS.map((check) => check.id));
  assert.deepEqual(missingChecks(CHECKS, CHECKS.map((check) => ({ id: check.id }))), []);
});
