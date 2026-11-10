import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  WEB_HML_BASELINE_SHA,
  WAVE_PLAN,
  acceptExportedRelease,
  diagnoseWebPreview,
  validateWebPreviewProject,
  wavePlanConflicts,
  webPreviewReleaseDocument,
} from "./web-preview.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const buildScript = join(root, "scripts/hml/web-preview-build.sh");
const diagnoseScript = join(root, "scripts/hml/web-preview-diagnose.mjs");
const SHA = WEB_HML_BASELINE_SHA;

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

test("o manifesto da prévia carrega o SHA e não se declara pronto", () => {
  const document = webPreviewReleaseDocument(SHA);
  assert.equal(document.channel, "vercel-hml");
  assert.equal(document.sourceSha, SHA);
  assert.equal(document.phase, "EM_EXECUCAO");
  assert.equal(document.ready, false);
  assert.equal(document.basePath, "");
  assert.equal(document.apiOrigin, null);
  assert.equal(document.protection, "sso-all-deployments");
  assert.equal(acceptExportedRelease(document, { previewChannel: "vercel-hml", sha: SHA }).ok, true);
});

test("o Pages oficial continua exigindo o canal github-pages", () => {
  const pages = {
    channel: "github-pages",
    sourceSha: SHA,
    phase: "EM_EXECUCAO",
    officialUrl: "https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/",
    apiOrigin: "https://id-riacho1-api-hml.vercel.app",
  };
  assert.equal(acceptExportedRelease(pages, {
    eventName: "push",
    ref: "refs/heads/main",
    sha: SHA,
  }).ok, true);
  const preview = acceptExportedRelease(pages, { eventName: "pull_request", ref: "refs/pull/1/merge", sha: SHA });
  assert.equal(preview.ok, false);
  assert.match(preview.reasons.join(" "), /sourceSha oficial/);
});

test("a prévia não se mistura com o push da main", () => {
  const document = webPreviewReleaseDocument(SHA);
  const mixed = acceptExportedRelease(document, {
    previewChannel: "vercel-hml",
    eventName: "push",
    ref: "refs/heads/main",
    sha: SHA,
  });
  assert.equal(mixed.ok, false);
  assert.match(mixed.reasons.join(" "), /push oficial da main/);
});

test("o arquivo do projeto web recusa SSO desligado e apply remoto", () => {
  const project = JSON.parse(readFileSync(join(root, "deploy/hml/web-preview.project.json"), "utf8"));
  assert.equal(validateWebPreviewProject(project).ok, true);
  assert.equal(validateWebPreviewProject({ ...project, apply: true }).ok, false);
  assert.equal(validateWebPreviewProject({ ...project, ssoProtection: "disabled" }).ok, false);
  assert.equal(validateWebPreviewProject({ ...project, projectName: "id-riacho1-api-hml" }).ok, false);
  assert.equal(validateWebPreviewProject({
    ...project,
    env: { ...project.env, DATABASE_URL: "postgresql://secret@localhost/idriacho1_hml" },
  }).ok, false);
});

test("o diagnóstico não marca a prévia pronta nem pede para desligar o SSO", () => {
  const paused = diagnoseWebPreview({
    alias: { httpStatus: 503, vercelError: "DEPLOYMENT_PAUSED", ssoChallenge: false },
    apiHealthStatus: 200,
    deployment: { available: false, missingToken: true, httpStatus: 403 },
  });
  assert.equal(paused.previewReady, false);
  assert.equal(paused.ssoAction, "preserve");
  assert.equal(paused.messageStillRequired, true);
  assert.ok(paused.forbidden.includes("disable-sso"));
  assert.match(paused.findings.find((item) => item.id === "alias-paused").evidence, /DEPLOYMENT_PAUSED/);
  assert.match(paused.humanControls.map((item) => item.action).join(" "), /dpl_J3zExHhufmJ8DtwZQiKvmVLnn8ju/);

  const authored = diagnoseWebPreview({
    alias: { httpStatus: 503, vercelError: "DEPLOYMENT_PAUSED", ssoChallenge: false },
    apiHealthStatus: 200,
    deployment: {
      available: true,
      readyState: "BLOCKED",
      errorMessage: "The Deployment was blocked because the commit author does not have contributing access",
      buildLogCount: 0,
    },
  });
  assert.equal(authored.previewReady, false);
  assert.equal(authored.causeFromDeploymentMessage, "git-author-hobby");
  assert.match(authored.humanControls.map((item) => item.action).join(" "), /Login Connections/);
  assert.equal(authored.humanControls.some((item) => /deslig/.test(item.action) && /SSO|autor/.test(item.action) && /desligar a verificação/.test(item.action)), true);

  const ready = diagnoseWebPreview({
    alias: { httpStatus: 200, vercelError: null, ssoChallenge: true },
    apiHealthStatus: 200,
    deployment: { available: true, readyState: "READY", errorMessage: null, buildLogCount: 12 },
  });
  assert.equal(ready.previewReady, false);
});

test("as frentes 169, 170 e 171 não dividem arquivo nem entram na main", () => {
  const plan = wavePlanConflicts();
  assert.equal(plan.ok, true, plan.reasons.join("\n"));
  assert.equal(WAVE_PLAN.mergeToMain, false);
  assert.equal(WAVE_PLAN.doNotMerge.includes(167), true);
  assert.equal(WAVE_PLAN.doNotMerge.includes(168), true);
});

test("o script recusa produção, main, outro projeto, seed e segredo", () => {
  const secret = "super-secret-database-value";
  const cases = [
    [{ VERCEL_ENV: "production" }, /produção/],
    [{ VERCEL_GIT_COMMIT_REF: "main" }, /branch main/],
    [{ VERCEL_PROJECT_NAME: "id-riacho1-api-hml" }, /id-riacho1-web-hml/],
    [{ SEED_HML_MASS: "true" }, /seed/],
    [{ CONFIRM_HML_MIGRATE: "idriacho1_hml" }, /migration/],
    [{ WEB_PREVIEW_DISABLE_SSO: "1" }, /SSO/],
    [{ WEB_PREVIEW_APPLY_REMOTE: "1" }, /remoto/],
    [{ DATABASE_URL: `postgresql://user:${secret}@localhost/idriacho1_hml` }, /DATABASE_URL/],
    [{ JWT_SECRET: secret }, /segredo/],
  ];
  for (const [env, pattern] of cases) {
    const result = run("bash", [buildScript, "--check"], env);
    assert.equal(result.status, 2, JSON.stringify(env));
    assert.match(`${result.stderr}\n${result.stdout}`, pattern);
    assert.equal(`${result.stderr}${result.stdout}`.includes(secret), false);
  }
  const ok = run("bash", [buildScript, "--check"], {
    VERCEL_PROJECT_NAME: "id-riacho1-web-hml",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "previa/rf1-v1",
  });
  assert.equal(ok.status, 0, ok.stderr);
});

test("a sonda gravada continua bloqueada e sem SSO", () => {
  const probe = JSON.parse(readFileSync(join(root, "docs/revitalizacao-144/previa-web-hml.probe.json"), "utf8"));
  assert.equal(probe.offline, false);
  assert.equal(probe.alias.httpStatus, 503);
  assert.equal(probe.alias.vercelError, "DEPLOYMENT_PAUSED");
  assert.equal(probe.alias.ssoChallenge, false);
  assert.equal(probe.deployment.httpStatus, 403);
  assert.equal(probe.deployment.missingToken, true);
  assert.equal(probe.apiHealthStatus, 200);
  assert.equal(probe.report.previewReady, false);
  assert.equal(probe.report.ssoAction, "preserve");
});

test("o diagnóstico offline não chama método de escrita e preserva o bloqueio", () => {
  const source = readFileSync(diagnoseScript, "utf8");
  assert.equal(/method:\s*["'](?:POST|PATCH|PUT|DELETE)/.test(source), false);
  assert.equal(source.includes("vercel deploy"), false);
  const result = run("node", [diagnoseScript, "--offline"], { VERCEL_TOKEN: "token-que-nao-pode-vazar" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("token-que-nao-pode-vazar"), false);
  assert.equal(result.stderr.includes("token-que-nao-pode-vazar"), false);
  const report = JSON.parse(result.stdout);
  assert.equal(report.report.previewReady, false);
  assert.equal(report.report.ssoAction, "preserve");
  assert.equal(report.alias.vercelError, "DEPLOYMENT_PAUSED");
});
