import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const reportPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../reports/run.json");

const required = [
  "login-frio-ui",
  "secretaria-buscar-ui",
  "secretaria-abrir-ui",
  "secretaria-editar-ui",
  "secretaria-reabrir-ui",
  "secretaria-persistencia-api",
  "viewport-360",
  "viewport-768",
  "viewport-1440",
  "navegacao-sem-reload",
  "sessao-refresh-falho",
  "api-401-sem-sessao",
  "api-403-admin-pastoral",
  "api-403-admin-ledger",
  "editor-conta",
  "indicadores-pastoral-open",
  "auditoria-metadata",
  "ci-pipeline",
  "hml-remota",
  "design-system-vitrine",
];

test("o relatório da execução integrada é coerente e não aprova a onda com pendência", (t) => {
  if (!fs.existsSync(reportPath)) {
    t.skip("reports/run.json ainda não foi gerado nesta árvore");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  const ids = new Set();
  for (const item of report.items) {
    assert.ok(["PASS", "FAIL", "BLOCKED"].includes(item.status), item.id);
    counts[item.status] += 1;
    assert.equal(ids.has(item.id), false, item.id);
    ids.add(item.id);
    assert.equal(/eyJ[A-Za-z0-9_-]{20,}/.test(JSON.stringify(item)), false, item.id);
    assert.equal(JSON.stringify(item).includes("idbrf_demo_token"), false, item.id);
  }
  for (const id of required) assert.equal(ids.has(id), true, id);
  assert.deepEqual(report.counts, counts);
  assert.equal(report.productApproved, counts.FAIL === 0 && counts.BLOCKED === 0);
  assert.equal(report.productApproved, false);
  assert.equal(report.stack, "postgres-local-sintetico");
});
