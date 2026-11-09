import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { classifyPhaseG } from "./phase-g-contract.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

test("o fonte da fase G não trata 501, menu genérico ou publicador ausente como pronto", () => {
  const report = classifyPhaseG(root);
  const byId = Object.fromEntries(report.items.map((item) => [item.id, item]));
  assert.equal(byId["schema-sem-vinculo-formal"].status, "BLOCKED");
  assert.equal(byId["api-vinculo-501"].status, "BLOCKED");
  assert.equal(byId["seed-publicador"].status, "BLOCKED");
  assert.equal(byId["seed-editor"].status, "PASS");
  assert.equal(byId["menu-por-papel"].status, "FAIL");
  assert.equal(byId["tesouraria-sem-engano"].status, "PASS");
  assert.equal(byId["meu-espaco-sem-lista"].status, "BLOCKED");
  assert.equal(byId["ficha-controle-no-fonte"].status, "PASS");
  assert.equal(byId["ci-sem-suite-g"].status, "BLOCKED");
  assert.equal(report.counts.PASS, 3);
  assert.equal(report.counts.FAIL, 1);
  assert.equal(report.counts.BLOCKED, 5);
});
