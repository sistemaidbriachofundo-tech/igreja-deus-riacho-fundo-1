import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const skipDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "out",
  ".next",
  "portal-screenshots",
]);
const patterns = [
  { name: "private-key", re: /-----BEGIN (?:RSA |OPENSSH |EC |PGP )?PRIVATE KEY-----/ },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "github-token", re: /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { name: "live-secret-key", re: /sk_live_[A-Za-z0-9]+/ },
];

const databaseUrl = /postgres(?:ql)?:\/\/([^/\s:@]+):([^@\s]+)@([^/\s:?#]+)/gi;
const fixturePasswords = new Set(["test-fixture", "secret", "segredo-nao-logar", "s3cret-db-pass"]);

function isLocalOrFixture(file, user, password, host) {
  if (!user || !password || !host) return true;
  if (password.startsWith("${") || password.includes("${")) return true;
  if (["localhost", "127.0.0.1", "::1", "postgres"].includes(host)) return true;
  if (host === "example.org" || host.endsWith(".example.org") || host === "example.com" || host.endsWith(".example.com")) {
    return true;
  }
  const testFile = /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file) || file.endsWith(".test.mjs");
  return testFile && fixturePasswords.has(password);
}

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (stat.size > 1_000_000) continue;
    if (entry === "package-lock.json" || entry.endsWith(".png") || entry.endsWith(".jpg")) continue;
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue;
    const rel = relative(root, path);
    for (const pattern of patterns) {
      if (pattern.re.test(text)) findings.push(`${rel}:${pattern.name}`);
    }
    databaseUrl.lastIndex = 0;
    for (const match of text.matchAll(databaseUrl)) {
      if (!isLocalOrFixture(rel, match[1], match[2], match[3])) {
        findings.push(`${rel}:remote-database-url`);
        break;
      }
    }
  }
}

walk(root);
if (findings.length > 0) {
  console.error("Segredos ou URLs remotas com senha encontrados. Valores omitidos.");
  for (const finding of findings) console.error(finding);
  process.exit(1);
}
console.log("Varredura de segredos concluída sem achados.");
