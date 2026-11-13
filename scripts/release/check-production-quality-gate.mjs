import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function sonar(path, params, token) {
  const url = new URL(path, "https://sonarcloud.io");
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SonarCloud ${path}: HTTP ${response.status}.`);
  return response.json();
}

async function verify() {
  const token = process.env.SONAR_TOKEN;
  if (!token) throw new Error("SONAR_TOKEN ausente no Environment SONAR_TOKEN.");

  git("fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main");
  const main = git("rev-parse", "origin/main");
  if (git("rev-parse", "HEAD^{tree}") !== git("rev-parse", "origin/main^{tree}")) {
    throw new Error(`O conteúdo da candidata difere de main (${main}). Homologue a versão antes de promover.`);
  }

  const project = readFileSync("sonar-project.properties", "utf8")
    .match(/^sonar\.projectKey=(\S+)$/m)?.[1];
  if (!project) throw new Error("sonar.projectKey ausente.");

  // A análise de main pode concluir após o build de produção.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const report = await sonar("/api/project_analyses/search", { project, ps: "30" }, token);
    const analysis = report.analyses?.find(item => item.revision === main);
    if (analysis?.key) {
      const gate = await sonar("/api/qualitygates/project_status", { analysisId: analysis.key }, token);
      if (gate.projectStatus?.status !== "OK") {
        throw new Error(`Quality Gate de main (${main}): ${gate.projectStatus?.status ?? "indisponível"}.`);
      }
      console.log(`Quality Gate OK para main ${main}, com conteúdo idêntico ao da candidata.`);
      return;
    }
    if (attempt < 11) await delay(15_000);
  }
  throw new Error(`Nenhuma análise do SonarCloud encontrada para a revisão exata de main: ${main}.`);
}

try {
  await verify();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
