import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migration = process.argv[2] ?? "";
if (!/^\d{14}_[a-z0-9_]+$/.test(migration)) {
  throw new Error("Informe o nome de uma migração Prisma de DEV.");
}

const root = fileURLToPath(new URL("../..", import.meta.url));
const developmentEndpoint = "ep-misty-silence-b6n7k8ez.c-2.sa-east-1.aws.neon.tech";
let url;
try {
  url = new URL(process.env.DATABASE_URL ?? "");
} catch {
  throw new Error("O banco de DEV não está configurado.");
}
const directHost = url.hostname.replace("-pooler.", ".");
if (process.env.VERCEL !== "1" || url.protocol !== "postgresql:" ||
    directHost !== developmentEndpoint || url.pathname !== "/idriacho1_hml" ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode"))) {
  throw new Error("A migração está restrita ao banco isolado de DEV.");
}
url.hostname = directHost;
url.searchParams.delete("pgbouncer");

const source = join(root, "packages/db/prisma");
const work = mkdtempSync(join(tmpdir(), "rf1-dev-migration-"));
try {
  mkdirSync(join(work, "migrations"));
  copyFileSync(join(source, "schema.prisma"), join(work, "schema.prisma"));
  copyFileSync(join(source, "migrations/migration_lock.toml"), join(work, "migrations/migration_lock.toml"));
  cpSync(join(source, "migrations", migration), join(work, "migrations", migration), { recursive: true });
  const result = spawnSync(process.execPath, [
    join(root, "node_modules/prisma/build/index.js"),
    "migrate", "deploy", "--schema", join(work, "schema.prisma"),
  ], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
