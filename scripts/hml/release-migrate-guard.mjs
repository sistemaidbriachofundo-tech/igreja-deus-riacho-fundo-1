import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decideHmlMigrate } from "../../packages/shared/src/release/revitalization-144.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--status")
    ? "status"
    : "dry-run";

const decision = decideHmlMigrate({
  databaseUrl: process.env.DATABASE_URL,
  mode,
  confirm: process.env.CONFIRM_HML_MIGRATE,
  seedRequested: process.env.SEED_HML_MASS === "true",
});

if (decision.exitCode !== 0) {
  console.error(decision.message);
  process.exit(decision.exitCode);
}

console.log(decision.message);
if (decision.action === "dry-run") process.exit(0);

const prismaArgs = decision.action === "status"
  ? ["prisma", "migrate", "status", "--schema", "packages/db/prisma/schema.prisma"]
  : ["prisma", "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"];
const result = spawnSync("npx", prismaArgs, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status === 0 ? 0 : result.status ?? 1);
