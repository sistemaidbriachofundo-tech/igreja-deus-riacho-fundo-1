import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { classify, productApproved } from "./classify.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

test("a main ainda não aprova a jornada de ficha nem a onda", () => {
  const report = classify(root);
  const byId = Object.fromEntries(report.items.map((item) => [item.id, item]));
  assert.equal(byId["secretaria-abrir-ficha-ui"].status, "FAIL");
  assert.equal(byId["secretaria-editar-ficha-ui"].status, "FAIL");
  assert.equal(byId["secretaria-reabrir-ficha-ui"].status, "FAIL");
  assert.equal(byId["editor-conta-sintetica"].status, "BLOCKED");
  assert.equal(byId["indicadores-contagem-pastoral"].status, "BLOCKED");
  assert.equal(byId["auditoria-metadata-sem-redacao"].status, "BLOCKED");
  assert.equal(byId["canon-papel-editor"].status, "PASS");
  assert.equal(byId["audit-papeis-do-controller"].status, "PASS");
  assert.equal(productApproved(report), false);
  assert.equal(report.counts.FAIL, 3);
});

test("o catálogo vigente é EDITOR_SITE, com a contagem pastoral ainda no resumo", () => {
  const report = classify(root);
  const canon = report.items.find((item) => item.id === "canon-papel-editor");
  assert.match(canon.summary, /EDITOR_SITE/);
  assert.match(canon.summary, /PUBLICADOR_SITE/);
  const pastoral = report.items.find((item) => item.id === "indicadores-contagem-pastoral");
  assert.match(pastoral.summary, /pastoralOpen/);
  assert.match(pastoral.summary, /@Roles/);
});

const wavePairs = [
  ["origin/main", "origin/cursor/rbac-personas-a3-649a"],
  ["origin/main", "origin/cursor/design-system-foundation-c0e3"],
  ["origin/main", "origin/cursor/a1-login-nav-rapida-a1ac"],
  ["origin/main", "origin/cursor/qa-e2e-persona-9013"],
  ["origin/cursor/rbac-personas-a3-649a", "origin/cursor/a1-login-nav-rapida-a1ac"],
  ["origin/cursor/design-system-foundation-c0e3", "origin/cursor/a1-login-nav-rapida-a1ac"],
  ["origin/cursor/a1-login-nav-rapida-a1ac", "origin/cursor/qa-e2e-persona-9013"],
];

test("merge-tree da onda 0 permanece limpo quando os refs estão no clone", (t) => {
  for (const ref of new Set(wavePairs.flat())) {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: root, stdio: "ignore" });
    } catch {
      t.skip(`ref ausente neste checkout: ${ref}`);
      return;
    }
  }
  for (const [left, right] of wavePairs) {
    const result = execFileSync(
      "git",
      ["merge-tree", "--write-tree", "--name-only", left, right],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.includes("CONFLICT"), false, `${left} + ${right}`);
  }
});
