import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyContrast,
  classifyDraftRoundtrip,
  classifyExpectedStatus,
  classifyFinanceHonesty,
  classifyFocusVisible,
  classifyFormalMembership,
  classifyLoginMe,
  classifyMenu,
  classifyOverflow,
  classifyOwnAgenda,
  classifyPublicationGate,
  contrastRatio,
  renderBugs,
  unexpectedModules,
} from "./phase-g";

test("login e /auth/me não aprovam conta ausente nem omitem escopo", () => {
  const blocked = classifyLoginMe({
    seeded: false,
    expectedEmail: "publicador.demo@example.test",
    expectedRole: "PUBLICADOR_SITE",
    loginStatus: 401,
    meStatus: null,
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.match(blocked.detail, /PUBLICADOR_SITE/);
  assert.doesNotMatch(blocked.detail, /Bearer|eyJ|admin/);

  const fail = classifyLoginMe({
    seeded: true,
    expectedEmail: "ana.demo@example.test",
    expectedRole: "SECRETARIA",
    loginStatus: 201,
    meStatus: 200,
    email: "ana.demo@example.test",
    roles: ["SECRETARIA"],
    organizationId: null,
    churchId: "church",
    personId: "person",
  });
  assert.equal(fail.status, "FAIL");

  const pass = classifyLoginMe({
    seeded: true,
    expectedEmail: "ana.demo@example.test",
    expectedRole: "SECRETARIA",
    loginStatus: 201,
    meStatus: 200,
    email: "ana.demo@example.test",
    roles: ["SECRETARIA"],
    organizationId: "org",
    churchId: "church",
    personId: "person",
  });
  assert.equal(pass.status, "PASS");
});

test("vínculo formal 501 não vira persistência", () => {
  const blocked = classifyFormalMembership(501, {
    code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED",
    members: null,
  });
  assert.equal(blocked.persistence, "BLOCKED");
  assert.equal(blocked.honesty, "PASS");

  const fake = classifyFormalMembership(200, { members: [{ id: "x" }] });
  assert.equal(fake.persistence, "PASS");

  const ambiguous = classifyFormalMembership(501, { message: "depois" });
  assert.equal(ambiguous.persistence, "FAIL");
  assert.equal(classifyExpectedStatus(403, 403, "escopo negado").status, "PASS");
  assert.equal(classifyExpectedStatus(200, 403, "escopo negado").status, "FAIL");
});

test("menu, agenda, finanças e rascunho recusam atalho e saldo inventado", () => {
  assert.deepEqual(unexpectedModules("MEMBRO", ["Painel", "Tesouraria", "Meu Espaço"]), ["Tesouraria"]);
  assert.equal(classifyMenu("MEMBRO", ["Painel", "Tesouraria"]).status, "FAIL");
  assert.equal(classifyMenu("TESOURARIA", ["Painel", "Tesouraria"]).status, "PASS");

  const agenda = classifyOwnAgenda({ listStatus: 403, disclosesGap: true, renderedScheduleItems: 0 });
  assert.equal(agenda.honesty, "PASS");
  assert.equal(agenda.persistence, "BLOCKED");
  const invented = classifyOwnAgenda({ listStatus: 403, disclosesGap: true, renderedScheduleItems: 2 });
  assert.equal(invented.honesty, "FAIL");

  const hidden = classifyFinanceHonesty({
    apiStatus: 403,
    metricTexts: ["Sem consulta", "Sem consulta", "Sem consulta", "Sem consulta"],
    pageText: "Banco, Pix e maquininha estão bloqueados. não é saldo da igreja",
  });
  assert.equal(hidden.status, "PASS");
  const lied = classifyFinanceHonesty({
    apiStatus: 403,
    metricTexts: ["R$ 100,00", "Sem consulta"],
    pageText: "Banco, Pix e maquininha estão bloqueados. não é saldo da igreja",
  });
  assert.equal(lied.status, "FAIL");

  assert.equal(
    classifyDraftRoundtrip({
      readStatus: 200,
      saveStatus: 200,
      markerSeen: true,
      restored: true,
      publishedDuringTest: false,
    }).status,
    "PASS",
  );
  assert.equal(
    classifyDraftRoundtrip({
      readStatus: 200,
      saveStatus: 200,
      markerSeen: true,
      restored: true,
      publishedDuringTest: true,
    }).status,
    "FAIL",
  );
});

test("contraste, overflow, foco e gate público têm limite explícito", () => {
  const black = contrastRatio([0, 0, 0], [255, 255, 255]);
  assert.ok(black > 20);
  assert.equal(classifyContrast(black), "PASS");
  assert.equal(classifyContrast(2.1), "FAIL");
  assert.equal(classifyContrast(3.1, true), "PASS");
  assert.equal(classifyOverflow(0), "PASS");
  assert.equal(classifyOverflow(24), "FAIL");
  assert.equal(classifyFocusVisible(2, "none"), "PASS");
  assert.equal(classifyFocusVisible(0, "none"), "FAIL");
  assert.equal(
    classifyPublicationGate({ httpStatus: 200, buttonDisabled: true, refusesCredential: true }).status,
    "PASS",
  );
  assert.equal(classifyPublicationGate({ httpStatus: 0, buttonDisabled: false, refusesCredential: false }).status, "BLOCKED");
  const bugs = renderBugs([
    { id: "G/x", persona: "MEMBRO", journey: "menu", status: "FAIL", detail: "Menu genérico" },
  ]);
  assert.match(bugs, /G\/x/);
});
