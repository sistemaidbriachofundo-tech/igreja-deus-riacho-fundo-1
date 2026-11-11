import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyAudit } from "./cve-classify.mjs";
import { HML_ORIGIN, runHttpMatrix } from "./http-matrix.mjs";
import { renderDocs } from "./report.mjs";
import { CANDIDATE_SHA, evaluateSources, SOURCE_FILES } from "./static-scan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const liveHml = process.argv.includes("--live-hml");

const files = {};
for (const path of SOURCE_FILES) {
  files[path] = readFileSync(resolve(repoRoot, path), "utf8");
}
const controls = evaluateSources(files);
const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();

const auditRaw = npmJson(["audit", "--omit=dev", "--json"]);
const auditOptional = npmJson(["audit", "--omit=dev", "--omit=optional", "--json"]);
const lockfile = readFileSync(resolve(repoRoot, "package-lock.json"), "utf8");
const cve = classifyAudit(JSON.parse(auditRaw), lockfile);
cve.omitOptionalCounts = JSON.parse(auditOptional).metadata?.vulnerabilities ?? {};

const fronts = inspectFronts();
const reuseHttp = process.argv.includes("--reuse-http");
let http = { executed: false };
if (liveHml && reuseHttp) {
  throw new Error("Use só uma opção: --live-hml ou --reuse-http");
}
if (liveHml) {
  const live = await runHttpMatrix({
    origin: HML_ORIGIN,
    fetchImpl: globalThis.fetch,
    candidateSha: CANDIDATE_SHA,
  });
  http = { executed: true, ...live };
} else if (reuseHttp) {
  http = JSON.parse(readFileSync(resolve(repoRoot, "qa/security-f11/reports/http.json"), "utf8"));
}

const docs = renderDocs({
  headSha,
  candidateSha: CANDIDATE_SHA,
  generatedAt: new Date().toISOString(),
  controls,
  http,
  cve,
  fronts,
});

const docDir = resolve(repoRoot, "docs/qa/security-f11");
const reportDir = resolve(repoRoot, "qa/security-f11/reports");
mkdirSync(docDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(docDir, "README.md"), docs.readme);
writeFileSync(resolve(docDir, "matriz.md"), docs.matriz);
writeFileSync(resolve(docDir, "ameacas.md"), docs.ameacas);
writeFileSync(resolve(docDir, "cves.md"), docs.cves);
writeFileSync(resolve(docDir, "reteste-perfis.md"), docs.reteste);
writeFileSync(resolve(docDir, "checklist-liberacao.md"), docs.checklist);
writeFileSync(resolve(docDir, "frentes-abc.md"), docs.fronts);
writeFileSync(resolve(reportDir, "matriz.json"), JSON.stringify(docs.machine, null, 2));
writeFileSync(resolve(reportDir, "http.json"), JSON.stringify(http, null, 2));
writeFileSync(resolve(reportDir, "npm-audit-omit-dev.json"), JSON.stringify({
  counts: cve.counts,
  omitOptionalCounts: cve.omitOptionalCounts,
  rows: cve.rows,
}, null, 2));

console.log(`HEAD ${headSha}`);
console.log(`controles ${docs.machine.summary.counts.PASS} PASS / ${docs.machine.summary.counts.FAIL} FAIL`);
console.log(`P0 ${docs.machine.summary.blockers.map((item) => item.id).join(" ")}`);
console.log(`HTTP ${http.executed ? http.origin : "não executado"}`);

function npmJson(args) {
  try {
    return execFileSync("npm", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.trim().startsWith("{")) {
      return error.stdout;
    }
    throw error;
  }
}

function inspectFronts() {
  let refs = "";
  try {
    refs = execFileSync("git", ["ls-remote", "--heads", "origin"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 20000,
    });
  } catch (error) {
    return {
      integrated: false,
      summary: `Não foi possível listar os heads remotos (${error instanceof Error ? error.message : "erro"}). A, B e C ficam BLOCKED.`,
      branches: {},
    };
  }
  const interesting = refs
    .split("\n")
    .map((line) => line.trim().split(/\s+/).pop() ?? "")
    .filter((ref) => /f1\.1|f11-|security-f11|mfa-obrig|observab|audit-writer/i.test(ref));
  return {
    integrated: false,
    summary: interesting.length
      ? `Heads remotos possivelmente da fase: ${interesting.map((line) => line.split(/\s+/).pop()).join(", ")}. Nenhum está mergeado nesta árvore. O reteste de correção continua BLOCKED até o integrador publicar o SHA conjunto.`
      : "Nenhum head remoto com nome de F1.1-A, B ou C apareceu nesta coleta. As issues #185, #186 e #187 seguem sem PR nesta prova. Integração BLOCKED.",
    branches: {},
    remoteHits: interesting,
  };
}
