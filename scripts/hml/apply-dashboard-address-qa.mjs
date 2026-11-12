import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const branch = process.env.VERCEL_GIT_COMMIT_REF;
const expected = "ep-misty-silence-b6n7k8ez.c-2.sa-east-1.aws.neon.tech";
let url;
try { url = new URL(process.env.DATABASE_URL ?? ""); }
catch { throw new Error("A conexão do banco QA não está disponível."); }

const directHost = url.hostname.replace("-pooler.", ".");
if (process.env.VERCEL !== "1" || (branch && branch !== "qa/dashboard-address-20261111") ||
    url.protocol !== "postgresql:" || directHost !== expected || url.pathname !== "/idriacho1_hml" ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode"))) {
  throw new Error("A migração está restrita à base isolada de QA desta publicação.");
}

url.hostname = directHost;
url.searchParams.delete("pgbouncer");
const result = spawnSync("npx", ["--no-install", "prisma", "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: url.toString() },
  stdio: "inherit",
});
if (result.error || result.status !== 0) process.exit(1);
