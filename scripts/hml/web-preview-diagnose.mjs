import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE_GIT,
  HML_API_ORIGIN,
  WEB_HML_ALIAS,
  WEB_HML_BLOCKED_DEPLOYMENT,
  WEB_HML_TEAM_ID,
  diagnoseWebPreview,
  validateWebPreviewProject,
} from "./web-preview.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const offline = process.argv.includes("--offline");
const outFlag = process.argv.indexOf("--out");
const outPath = outFlag >= 0 ? resolve(process.argv[outFlag + 1] ?? "") : "";

function redact(value, token) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!token) return text;
  return text.split(token).join("[redacted]");
}

async function readAlias() {
  const response = await fetch(WEB_HML_ALIAS, { redirect: "manual" });
  const body = (await response.text()).slice(0, 240);
  const location = response.headers.get("location") ?? "";
  return {
    url: WEB_HML_ALIAS,
    httpStatus: response.status,
    vercelError: response.headers.get("x-vercel-error"),
    ssoChallenge: response.status === 401 || /vercel\.com\/(sso|login)/.test(location),
    body,
  };
}

async function readApiHealth() {
  const response = await fetch(`${HML_API_ORIGIN}/health`, { redirect: "manual" });
  return response.status;
}

async function readDeployment(token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const url = `https://api.vercel.com/v13/deployments/${WEB_HML_BLOCKED_DEPLOYMENT}?teamId=${WEB_HML_TEAM_ID}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    let missingToken = response.status === 401 || !token;
    try {
      const body = await response.json();
      missingToken = missingToken || Boolean(body?.error?.missingToken);
    } catch {
      missingToken = missingToken || response.status === 403;
    }
    return { available: false, missingToken, httpStatus: response.status };
  }
  const body = await response.json();
  let buildLogCount = null;
  if (token) {
    const events = await fetch(
      `https://api.vercel.com/v3/deployments/${WEB_HML_BLOCKED_DEPLOYMENT}/events?teamId=${WEB_HML_TEAM_ID}&builds=1&direction=forward`,
      { headers },
    );
    if (events.ok) {
      const payload = await events.json();
      buildLogCount = Array.isArray(payload) ? payload.length : null;
    }
  }
  return {
    available: true,
    missingToken: false,
    readyState: body.readyState ?? null,
    errorCode: body.errorCode ?? null,
    errorMessage: body.errorMessage ?? null,
    buildLogCount,
    commitSha: body?.meta?.githubCommitSha ?? null,
    projectName: body?.name ?? null,
  };
}

const project = JSON.parse(readFileSync(resolve(root, "deploy/hml/web-preview.project.json"), "utf8"));
const projectVerdict = validateWebPreviewProject(project);
if (!projectVerdict.ok) {
  console.error(projectVerdict.reasons.join("\n"));
  process.exit(2);
}

const token = process.env.VERCEL_TOKEN ?? "";
const alias = offline
  ? {
      url: WEB_HML_ALIAS,
      httpStatus: 503,
      vercelError: "DEPLOYMENT_PAUSED",
      ssoChallenge: false,
      body: "The deployment is currently unavailable\n\nDEPLOYMENT_PAUSED",
    }
  : await readAlias();
const apiHealthStatus = offline ? 200 : await readApiHealth();
const deployment = offline ? { available: false, missingToken: !token } : await readDeployment(token);
const report = diagnoseWebPreview({
  alias,
  apiHealthStatus,
  deployment,
  git: BASELINE_GIT,
});
const payload = {
  generatedAt: new Date().toISOString(),
  offline,
  alias,
  apiHealthStatus,
  deployment: token ? JSON.parse(redact(deployment, token)) : deployment,
  report,
};
const serialized = JSON.stringify(payload);
if (token && serialized.includes(token)) {
  console.error("BLOQUEADO: o relatório vazaria o token");
  process.exit(2);
}
const safe = token ? JSON.parse(serialized.split(token).join("[redacted]")) : payload;
const text = `${JSON.stringify(safe, null, 2)}\n`;
if (outPath) writeFileSync(outPath, text);
process.stdout.write(text);
