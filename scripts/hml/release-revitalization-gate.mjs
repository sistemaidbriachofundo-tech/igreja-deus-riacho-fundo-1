import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { API_CONTRACT_VERSION } from "../../packages/shared/src/api-contracts/version.ts";
import {
  HML_API_ORIGIN,
  HML_PERSONAS,
  PAGES_ORIGIN,
} from "../../packages/shared/src/release/eklesia-gate.ts";
import {
  REVITALIZATION_FRONT_IDS,
  evaluateRevitalization144,
} from "../../packages/shared/src/release/revitalization-144.ts";
import { buildInventory } from "./release-inventory-lib.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const offline = process.argv.includes("--offline");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function gitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

async function readJson(url) {
  if (offline) return { status: null, json: null };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    try {
      return { status: response.status, json: JSON.parse(text) };
    } catch {
      return { status: response.status, json: null };
    }
  } catch {
    return { status: null, json: null };
  }
}

const inventory = buildInventory(root);
const issueByFront = { A: 145, B: 146, C: 147, D: 148, E: 149, F: 150, G: 151, H: 152, I: 153 };
const fronts = REVITALIZATION_FRONT_IDS.map((id) => ({
  id,
  issue: issueByFront[id],
  pullRequest: null,
  acceptance: "BLOCKED",
  evidence: `A frente ${id} (#${issueByFront[id]}) ainda não tem PR desta rodada disponível para o integrador.`,
}));
const personas = HML_PERSONAS.map((id) => ({
  id,
  status: "BLOCKED",
  evidence: "A frente I ainda não entregou a matriz autenticada das oito personas.",
}));

const [meta, release] = await Promise.all([
  readJson(`${HML_API_ORIGIN}/meta`),
  readJson(`${PAGES_ORIGIN}/release.json`),
]);

const observation = {
  expectedSourceSha: gitSha(),
  pagesSourceSha: typeof release.json?.sourceSha === "string" ? release.json.sourceSha : null,
  apiSourceSha: typeof meta.json?.sourceSha === "string" ? meta.json.sourceSha : null,
  apiContractVersion: typeof meta.json?.contractVersion === "string" ? meta.json.contractVersion : null,
  expectedContractVersion: API_CONTRACT_VERSION,
  ministryMembershipTableReady: null,
  fronts,
  personas,
  userFacing501Count: inventory.userFacing501Count,
  localStorageFallbackCount: inventory.localStorageFallbackCount,
  seed: {
    attempted: false,
    database: null,
    personsBefore: null,
    personsAfter: null,
    passwordsReset: false,
  },
  deployAuthorized: false,
};

const verdict = evaluateRevitalization144(observation);
const report = {
  observedAt: new Date().toISOString(),
  phase: verdict.phase,
  releaseComplete: verdict.releaseComplete,
  offline,
  expectedSourceSha: observation.expectedSourceSha,
  pagesSourceSha: observation.pagesSourceSha,
  apiSourceSha: observation.apiSourceSha,
  checks: verdict.checks,
  note: "EM_EXECUCAO não é homologação. Merge e deploy permanecem fechados.",
};

const dir = resolve(root, argValue("--out") ?? "docs/revitalizacao-144");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "gate.json"), `${JSON.stringify(report, null, 2)}\n`);
const counts = report.checks.reduce((acc, check) => {
  acc[check.status] = (acc[check.status] ?? 0) + 1;
  return acc;
}, {});
console.log(`phase=${report.phase} releaseComplete=${report.releaseComplete} PASS=${counts.PASS ?? 0} FAIL=${counts.FAIL ?? 0} BLOCKED=${counts.BLOCKED ?? 0}`);
if (report.releaseComplete) {
  console.error("O gate não pode declarar pronto nesta rodada sem as frentes A–I e a QA.");
  process.exit(1);
}
