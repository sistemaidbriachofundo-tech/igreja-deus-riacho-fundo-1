import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", "dist", ".next", "coverage", "out"]);

export const REMOVED_PRODUCT_TOKENS = [
  ["ChurchWorkspace", /\bChurchWorkspace\b/],
  ["DemoLogin", /\bDemoLogin\b/],
  ["church-workspace.module.css", /church-workspace\.module\.css/],
  ["app/app/workspace.module.css", /app\/app\/workspace\.module\.css/],
];

export function walkSource(root, start) {
  const files = [];
  const visit = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(ts|tsx|js|mjs|css)$/.test(entry.name)) files.push(full);
    }
  };
  visit(start);
  return files.map((file) => relative(root, file).replaceAll("\\", "/"));
}

export function classifyStorageCall(call) {
  if (/\.(test|spec)\./.test(call.file) || call.file.startsWith("qa/")) return "TESTE";
  if (call.api === "sessionStorage") return "SESSAO_AUTENTICACAO";
  if (call.file === "apps/web/src/components/ChurchWorkspace.tsx") return "ORFAO";
  if (call.file === "apps/web/src/lib/use-church-records.ts") return "FALLBACK_ATIVO";
  if (call.file.startsWith("apps/web/src/app/app/demo/")) return "ROTA_LEGADA";
  if (call.api === "localStorage") return "REVISAR";
  return "SESSAO_AUTENTICACAO";
}

export function storageCallsIn(file, text) {
  const calls = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const api = line.includes("localStorage")
      ? "localStorage"
      : line.includes("sessionStorage")
        ? "sessionStorage"
        : null;
    if (!api) return;
    calls.push({
      file,
      line: index + 1,
      api,
      excerpt: line.trim().slice(0, 180),
    });
  });
  return calls;
}

export function isUserFacingSource(file) {
  if (/\.(test|spec)\./.test(file)) return false;
  if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return false;
  return file.startsWith("apps/web/src/components/")
    || file.startsWith("apps/web/src/app/")
    || file.startsWith("apps/web/src/lib/");
}

export function lineMentions501(line) {
  return /\b501\b/.test(line);
}

export function buildInventory(root) {
  const files = walkSource(root, join(root, "apps"));
  const storage = [];
  const mentions501 = [];
  const dangling = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    for (const call of storageCallsIn(file, text)) {
      storage.push({ ...call, classification: classifyStorageCall(call) });
    }
    if (isUserFacingSource(file)) {
      text.split("\n").forEach((line, index) => {
        if (!lineMentions501(line)) return;
        mentions501.push({ file, line: index + 1, excerpt: line.trim().slice(0, 180) });
      });
    }
    if (!/\.(test|spec)\./.test(file)) {
      for (const [token, pattern] of REMOVED_PRODUCT_TOKENS) {
        if (pattern.test(text)) dangling.push({ file, token });
      }
    }
  }
  const fallbackFiles = new Set(
    storage
      .filter((call) => call.classification === "FALLBACK_ATIVO" || call.classification === "ROTA_LEGADA" || call.classification === "REVISAR" || call.classification === "ORFAO")
      .map((call) => call.file),
  );
  const files501 = new Set(mentions501.map((item) => item.file));
  return {
    generatedFrom: "scripts/hml/release-inventory-lib.mjs",
    storage,
    mentions501,
    dangling,
    localStorageFallbackCount: fallbackFiles.size,
    userFacing501Count: files501.size,
  };
}
