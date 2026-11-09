import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const report = JSON.parse(readFileSync(new URL("../reports/matriz.json", import.meta.url), "utf8"));

test("a matriz nomeia PASS, FAIL ou BLOCKED em todos os casos", () => {
  assert.ok(report.cases.length >= 13);
  for (const item of report.cases) {
    assert.ok(["PASS", "FAIL", "BLOCKED"].includes(item.status), item.id);
    if (item.status === "BLOCKED") assert.ok(item.reason && item.reason.length > 20, item.id);
    if (item.status === "FAIL") {
      assert.ok(item.severity === "P0" || item.severity === "P1", item.id);
      assert.ok(item.recommendation, item.id);
      assert.ok(item.findings.some((finding) => finding.severity === "P0" || finding.severity === "P1"));
    }
  }
});

test("dashboards sem tela permanecem BLOCKED", () => {
  for (const id of ["UX-07", "UX-08", "UX-09", "UX-10", "UX-11", "UX-12", "UX-13"]) {
    const item = report.cases.find((entry) => entry.id === id);
    assert.equal(item.status, "BLOCKED", id);
  }
});
