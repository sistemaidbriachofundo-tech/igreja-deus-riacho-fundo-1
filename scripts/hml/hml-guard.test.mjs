import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const buildScript = join(root, "scripts/hml/build-api-vercel.sh");
const writeScript = join(root, "scripts/hml/write-pages-release.mjs");
const gateScript = join(root, "scripts/hml/eklesia-release-gate.mjs");

function run(command, args, env) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

test("recusa banco que não é o Neon idriacho1_hml", () => {
  const result = run("bash", [buildScript], {
    DATABASE_URL: "postgresql://idbrf:secret@localhost:5432/postgres",
    NODE_ENV: "production",
    JWT_SECRET: "x".repeat(32),
    HML_DEMO_PASSWORD_HASH: "hash",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /idriacho1_hml/);
  assert.equal(result.stdout.includes("secret"), false);
  assert.equal(result.stderr.includes("secret"), false);
});

test("recusa projeto Vercel que não é a API HML", () => {
  const result = run("bash", [buildScript], {
    DATABASE_URL: "postgresql://idbrf:secret@localhost:5432/idriacho1_hml",
    VERCEL_PROJECT_NAME: "igreja-producao",
    NODE_ENV: "production",
    JWT_SECRET: "x".repeat(32),
    HML_DEMO_PASSWORD_HASH: "hash",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /id-riacho1-api-hml/);
  assert.equal(result.stderr.includes("secret"), false);
});

test("o manifesto de preview não carimba SHA nem conclui a fase", () => {
  const dir = mkdtempSync(join(tmpdir(), "eklesia-release-"));
  const destination = join(dir, "release.json");
  const result = run("node", [writeScript], {
    RELEASE_JSON_PATH: destination,
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_REF: "refs/pull/133/merge",
    GITHUB_SHA: "a".repeat(40),
  });
  assert.equal(result.status, 0);
  const document = JSON.parse(readFileSync(destination, "utf8"));
  assert.equal(document.channel, "preview");
  assert.equal(document.sourceSha, null);
  assert.equal(document.phase, "EM_EXECUCAO");
  assert.equal(document.apiOrigin, null);
});

test("o fixture com contrato divergente permanece em execução", () => {
  const dir = mkdtempSync(join(tmpdir(), "eklesia-gate-"));
  const fixture = join(dir, "fixture.json");
  const out = join(dir, "out");
  const sha = "b".repeat(40);
  writeFileSync(fixture, JSON.stringify({
    expectedContractVersion: "0.7.4-rf025",
    expectedSourceSha: sha,
    apiHealthStatus: 200,
    apiContractVersion: "0.7.2-f2",
    apiSourceSha: null,
    probes: [
      { method: "GET", path: "/auth/me", status: 401, kind: "private", leak: false },
      { method: "GET", path: "/public/home", status: 200, kind: "public", leak: false },
      { method: "POST", path: "/auth/login", status: 400, kind: "reject-login", leak: false },
      { method: "OPTIONS", path: "/public/vivi/chat", status: 204, kind: "cors", leak: false },
    ],
    pages: {
      homeStatus: 200,
      churchName: true,
      demoSeed: false,
      publicNav: true,
      releaseSha: null,
      releasePhase: null,
    },
    fronts: ["A", "B", "C", "D", "E", "F", "G"].map((id, index) => ({
      id,
      issue: 126 + index,
      pullRequest: null,
      pullState: "absent",
      acceptance: "BLOCKED",
      evidence: "fixture",
    })),
    personas: ["admin", "pastor", "secretaria", "tesouraria", "lider", "membro", "editor", "publicador"].map((id) => ({
      id,
      status: "BLOCKED",
      evidence: "fixture",
    })),
    ministryMembershipModel: false,
    ownRosterRoute: false,
    vercelTokenPresent: false,
  }));
  const result = run("node", [gateScript, "--fixture", fixture, "--out", out], {});
  assert.equal(result.status, 0);
  assert.match(result.stdout, /releaseComplete=false/);
  assert.match(result.stdout, /phase=EM_EXECUCAO/);
  const report = JSON.parse(readFileSync(join(out, "matriz.json"), "utf8"));
  assert.equal(report.releaseComplete, false);
  assert.equal(report.checks.find((check) => check.id === "api-contract").status, "FAIL");
});
