import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const migration = "packages/db/prisma/migrations/20261111193000_f11_session_mfa_policy_ratelimit/migration.sql";
const down = "packages/db/prisma/migrations/20261111193000_f11_session_mfa_policy_ratelimit/down.sql";
const required = [migration, down, "docs/liberacao-producao.md", "docs/f11-integracao-status.md"];
let failed = false;

for (const file of required) {
  if (!existsSync(join(root, file))) {
    console.error(`Ausente: ${file}`);
    failed = true;
  }
}

const scan = spawnSync(process.execPath, ["scripts/release/secret-scan.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if (scan.status !== 0) failed = true;

const database = spawnSync(process.execPath, ["scripts/release/assert-local-database.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (database.status !== 0) failed = true;

console.log("Nenhuma migração foi aplicada. Nenhum deploy foi feito. Nenhum banco remoto foi contactado.");
console.log("Decisão desta fase: NO-GO. MFA de login, revogação no guarda JWT e QA independente seguem BLOCKED.");
process.exit(failed ? 1 : 2);
