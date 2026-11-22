#!/usr/bin/env node
/**
 * Recusa publicar out de GitHub Pages ou sem marcadores de apex/produção.
 * Uso: node deploy/prod/verify-apex-out.mjs <outDir> [expectedSha]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] || "apps/web/out";
const expectedSha = process.argv[3] || "";

function fail(msg) {
  console.error(`APEX_GUARD_FAIL: ${msg}`);
  process.exit(1);
}

if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
  fail(`out ausente: ${outDir}`);
}

const indexPath = join(outDir, "index.html");
if (!existsSync(indexPath)) fail("index.html ausente (causa clássica de 403 no LiteSpeed)");

const html = readFileSync(indexPath, "utf8");
if (html.includes("/igreja-deus-riacho-fundo-1/_next")) {
  fail("out tem basePath do GitHub Pages — não publicar no apex");
}
if (!html.includes("/_next/static")) {
  fail("out sem /_next/static na raiz — build apex incompleto");
}
if (!/Igreja de Deus/i.test(html)) {
  fail("index.html não parece o portal da igreja");
}

const releasePath = join(outDir, "release.json");
if (existsSync(releasePath)) {
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  if (release.basePath && release.basePath !== "") {
    fail(`release.json basePath=${release.basePath} (deve ser vazio no apex)`);
  }
  if (expectedSha && release.sourceSha && !String(release.sourceSha).startsWith(expectedSha)) {
    fail(`SHA ${release.sourceSha} ≠ esperado ${expectedSha}`);
  }
} else if (expectedSha) {
  fail("release.json obrigatório quando SHA é informado");
}

const top = readdirSync(outDir);
for (const banned of ["package.json", "apps", "packages", ".github", "docker-compose.yml"]) {
  if (top.includes(banned)) {
    fail(`parece monorepo no document root (${banned}) — nunca publicar fonte`);
  }
}

console.log(
  JSON.stringify({
    ok: true,
    outDir,
    expectedSha: expectedSha || null,
    indexBytes: html.length,
  }),
);
