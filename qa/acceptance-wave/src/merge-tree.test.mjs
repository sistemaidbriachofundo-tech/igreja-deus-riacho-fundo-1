import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

const cleanPairs = [
  ["origin/main", "origin/cursor/rbac-personas-a3-649a"],
  ["origin/main", "origin/cursor/design-system-foundation-c0e3"],
  ["origin/main", "origin/cursor/a1-login-nav-rapida-a1ac"],
  ["origin/main", "origin/cursor/qa-e2e-persona-9013"],
  ["origin/main", "origin/cursor/secretaria-ficha-7392"],
  ["origin/main", "origin/cursor/integration-wave-qa-8c1a"],
  ["origin/cursor/a1-login-nav-rapida-a1ac", "origin/cursor/secretaria-ficha-7392"],
  ["origin/cursor/rbac-personas-a3-649a", "origin/cursor/secretaria-ficha-7392"],
  ["origin/cursor/design-system-foundation-c0e3", "origin/cursor/qa-e2e-persona-9013"],
];

function hasRef(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function conflicts(left, right) {
  const result = execFileSync("git", ["merge-tree", "--write-tree", "--name-only", left, right], {
    cwd: root,
    encoding: "utf8",
  });
  return [...result.matchAll(/Merge conflict in (.+)$/gm)].map((match) => match[1].trim());
}

test("a onda 0 com a Secretaria fecha sem conflito de arquivo quando os refs existem", (t) => {
  for (const ref of new Set(cleanPairs.flat())) {
    if (!hasRef(ref)) {
      t.skip(`ref ausente neste checkout: ${ref}`);
      return;
    }
  }
  for (const [left, right] of cleanPairs) {
    assert.deepEqual(conflicts(left, right), [], `${left} + ${right}`);
  }
});
