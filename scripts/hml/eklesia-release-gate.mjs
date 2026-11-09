import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_CONTRACT_VERSION } from "../../packages/shared/src/api-contracts/version.ts";
import {
  HML_API_ORIGIN,
  HML_PERSONAS,
  PAGES_ORIGIN,
  evaluateEklesiaRelease,
} from "../../packages/shared/src/release/eklesia-gate.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const PAGES_SITE_ORIGIN = "https://sistemaidbriachofundo-tech.github.io";
const SECRET_KEYS = new Set([
  "password",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
  "cpf",
  "authorization",
  "pastoralnote",
  "documentnumber",
  "jwt",
]);
const PRIVATE_PATHS = [
  "/auth/me",
  "/persons/search?q=sintetico",
  "/admissions",
  "/households",
  "/audit-logs",
  "/indicators/summary",
  "/ministry-scope/min-homens/formal-memberships",
  "/rosters",
  "/cms/contents",
  "/pastoral-cases",
  "/credentials/me",
  "/channels/outbox",
];
const PUBLIC_PATHS = ["/public/home", "/public/events", "/public/ministries"];
const FRONTS = [
  ["A", 126, "Ficha 360° e Secretaria"],
  ["B", 127, "Ministérios, integrantes e liderança"],
  ["C", 128, "Escalas e Meu Espaço"],
  ["D", 129, "Navegação por persona"],
  ["E", 130, "Eventos, presença e relatórios"],
  ["F", 131, "CMS institucional"],
  ["G", 132, "QA E2E independente"],
];
const DEMO_SEED = /Culto em Família \(demo\)|Encontro de Jovens \(demo\)|Bem-vindo à casa \(demo\)/i;

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function request(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers, error: null };
  } catch (error) {
    return {
      status: null,
      text: "",
      headers: new Headers(),
      error: error instanceof Error ? error.message : "falha de rede",
    };
  }
}

function secretLeak(text) {
  if (!text) return false;
  try {
    const found = [];
    const walk = (value) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (SECRET_KEYS.has(key.toLowerCase())) found.push(key);
        walk(child);
      }
    };
    walk(JSON.parse(text));
    return found.length > 0;
  } catch {
    return false;
  }
}

function discoverFronts() {
  let open = [];
  let merged = [];
  try {
    open = JSON.parse(execFileSync("gh", [
      "pr", "list", "--state", "open", "--limit", "50",
      "--json", "number,title,isDraft",
    ], { cwd: root, encoding: "utf8" }));
    merged = JSON.parse(execFileSync("gh", [
      "pr", "list", "--state", "merged", "--limit", "40",
      "--json", "number,title",
    ], { cwd: root, encoding: "utf8" }));
  } catch {
    open = [];
    merged = [];
  }
  return FRONTS.map(([id, issue, title]) => {
    const tag = `[EKLESIA/${id}]`;
    const foundOpen = open.find((pull) => String(pull.title).includes(tag));
    const foundMerged = merged.find((pull) => String(pull.title).includes(tag));
    const pull = foundOpen ?? foundMerged ?? null;
    let evidence = `Issue #${issue} (${title}) sem PR desta fase. O módulo não foi reimplementado aqui.`;
    let pullState = "absent";
    if (foundMerged && !foundOpen) {
      pullState = "merged";
      evidence = `PR #${foundMerged.number} está na main, sem aceite da QA #132 e sem API HML confirmada neste SHA.`;
    } else if (foundOpen) {
      pullState = "open";
      evidence = `PR #${foundOpen.number}${foundOpen.isDraft ? " draft" : ""} aberto. Ainda não entra na main.`;
    }
    return {
      id,
      issue,
      pullRequest: pull ? pull.number : null,
      pullState,
      acceptance: "BLOCKED",
      evidence,
    };
  });
}

function repoFacts() {
  const schema = readFileSync(resolve(root, "packages/db/prisma/schema.prisma"), "utf8");
  const roster = readFileSync(
    resolve(root, "apps/api/src/ministries/ministries.controller.ts"),
    "utf8",
  );
  return {
    ministryMembershipModel: /model\s+MinistryMembership\b/.test(schema),
    ownRosterRoute: /@(Get|Post)\("me"\)/.test(roster) || roster.includes("my-assignments"),
  };
}

function personaReports() {
  return HML_PERSONAS.map((id) => ({
    id,
    status: "BLOCKED",
    evidence: "Sem segredo de persona neste ambiente. A sessão sintética não foi aberta e nenhuma senha do repositório foi usada.",
  }));
}

async function captureViewports(directory) {
  const chrome = process.env.CHROME_PATH || "google-chrome";
  mkdirSync(directory, { recursive: true });
  const captured = [];
  for (const width of [360, 768, 1440]) {
    const file = resolve(directory, `pages-home-${width}.png`);
    try {
      execFileSync(chrome, [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        "--virtual-time-budget=4000",
        `--window-size=${width},900`,
        `--screenshot=${file}`,
        `${PAGES_ORIGIN}/`,
      ], { stdio: "ignore", timeout: 12000 });
      captured.push(file);
    } catch {
      if (existsSync(file) && statSync(file).size > 1000) captured.push(file);
      else console.error(`captura ${width}px não concluída`);
    }
  }
  return captured;
}

async function observe() {
  const [health, meta, home, release, login, cors] = await Promise.all([
    request(`${HML_API_ORIGIN}/health`),
    request(`${HML_API_ORIGIN}/meta`),
    request(`${PAGES_ORIGIN}/`),
    request(`${PAGES_ORIGIN}/release.json`),
    request(`${HML_API_ORIGIN}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    request(`${HML_API_ORIGIN}/public/vivi/chat`, {
      method: "OPTIONS",
      headers: {
        Origin: PAGES_SITE_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    }),
  ]);
  const privateProbes = await Promise.all(PRIVATE_PATHS.map(async (path) => {
    const result = await request(`${HML_API_ORIGIN}${path}`);
    return {
      method: "GET",
      path,
      status: result.status,
      kind: "private",
      leak: result.status === 200 && secretLeak(result.text),
    };
  }));
  const publicProbes = await Promise.all(PUBLIC_PATHS.map(async (path) => {
    const result = await request(`${HML_API_ORIGIN}${path}`);
    return {
      method: "GET",
      path,
      status: result.status,
      kind: "public",
      leak: secretLeak(result.text),
    };
  }));
  let metaJson = null;
  try {
    metaJson = JSON.parse(meta.text);
  } catch {
    metaJson = null;
  }
  let releaseJson = null;
  if (release.status === 200) {
    try {
      releaseJson = JSON.parse(release.text);
    } catch {
      releaseJson = null;
    }
  }
  const allowOrigin = cors.headers.get("access-control-allow-origin");
  const corsLeak = allowOrigin === "*" || (allowOrigin !== null && allowOrigin !== PAGES_SITE_ORIGIN);
  const facts = repoFacts();
  const html = home.text;
  return {
    expectedContractVersion: API_CONTRACT_VERSION,
    expectedSourceSha: git(["rev-parse", "HEAD"]),
    mainSha: git(["rev-parse", "origin/main"]),
    apiHealthStatus: health.status,
    apiContractVersion: typeof metaJson?.contractVersion === "string" ? metaJson.contractVersion : null,
    apiSourceSha: typeof metaJson?.sourceSha === "string" ? metaJson.sourceSha : null,
    probes: [
      ...privateProbes,
      ...publicProbes,
      { method: "POST", path: "/auth/login", status: login.status, kind: "reject-login", leak: false },
      {
        method: "OPTIONS",
        path: "/public/vivi/chat",
        status: cors.status,
        kind: "cors",
        leak: corsLeak,
      },
    ],
    pages: {
      homeStatus: home.status,
      churchName: /Igreja de Deus|ID Riacho/i.test(html),
      demoSeed: DEMO_SEED.test(html),
      publicNav: ["Início", "Quem somos", "Agenda", "Login"].every((label) => html.includes(label)),
      releaseSha: typeof releaseJson?.sourceSha === "string" ? releaseJson.sourceSha : null,
      releasePhase: typeof releaseJson?.phase === "string" ? releaseJson.phase : null,
    },
    fronts: discoverFronts(),
    personas: personaReports(),
    ministryMembershipModel: facts.ministryMembershipModel,
    ownRosterRoute: facts.ownRosterRoute,
    vercelTokenPresent: Boolean(process.env.VERCEL_TOKEN),
    networkErrors: [health, meta, home].filter((item) => item.error).map((item) => item.error),
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Matriz Eklesia — frente H",
    "",
    `- Fase: **${report.phase}**`,
    `- releaseComplete: **${report.releaseComplete}**`,
    `- Commit avaliado: \`${report.expectedSourceSha}\``,
    `- origin/main: \`${report.mainSha}\``,
    `- Contrato neste commit: \`${report.expectedContractVersion}\``,
    `- Contrato na API HML: \`${report.apiContractVersion ?? "ausente"}\``,
    `- sourceSha na API HML: \`${report.apiSourceSha ?? "ausente"}\``,
    `- Observado em: ${report.observedAt}`,
    `- API: ${HML_API_ORIGIN}`,
    `- Pages: ${PAGES_ORIGIN}/`,
    "",
    "| ID | Frente | Status | Evidência |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((check) => `| ${check.id} | ${check.front} | ${check.status} | ${check.evidence.replaceAll("|", "/")} |`),
    "",
    "A fase #125 permanece em execução enquanto existir FAIL ou BLOCKED. Este arquivo não declara a homologação concluída.",
    "",
  ];
  if (report.viewportCaptures.length > 0) {
    lines.push("Capturas do site oficial já publicado, nos viewports 360, 768 e 1440. Não substituem a QA autenticada da frente G.", "");
    for (const file of report.viewportCaptures) lines.push(`- \`${file}\``);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function writeReport(outDir, observation, captures) {
  const verdict = evaluateEklesiaRelease(observation);
  const report = {
    observedAt: new Date().toISOString(),
    phase: verdict.phase,
    releaseComplete: verdict.releaseComplete,
    expectedSourceSha: observation.expectedSourceSha,
    mainSha: observation.mainSha ?? observation.expectedSourceSha,
    expectedContractVersion: observation.expectedContractVersion,
    apiContractVersion: observation.apiContractVersion,
    apiSourceSha: observation.apiSourceSha,
    checks: verdict.checks,
    viewportCaptures: captures,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "matriz.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(outDir, "matriz.md"), renderMarkdown(report));
  const counts = report.checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`phase=${report.phase} releaseComplete=${report.releaseComplete} PASS=${counts.PASS ?? 0} FAIL=${counts.FAIL ?? 0} BLOCKED=${counts.BLOCKED ?? 0}`);
  console.log(`matriz ${resolve(outDir, "matriz.md")}`);
  return report;
}

const fixturePath = argValue("--fixture");
const outDir = resolve(root, argValue("--out") ?? "qa/eklesia-h");

if (fixturePath) {
  const fixture = JSON.parse(readFileSync(resolve(fixturePath), "utf8"));
  const report = writeReport(outDir, fixture, []);
  process.exit(report.releaseComplete ? 0 : 0);
}

const observation = await observe();
const captures = argValue("--screenshots") === "off"
  ? []
  : await captureViewports(resolve(outDir, "evidence"));
const report = writeReport(outDir, observation, captures.map((file) => relative(root, file)));
if (observation.apiHealthStatus === null && observation.pages.homeStatus === null) {
  console.error("Sonda sem resposta da API HML e do Pages.");
  process.exit(1);
}
if (report.releaseComplete) process.exit(0);
process.exit(0);
