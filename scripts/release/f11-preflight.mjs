import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const migration = "packages/db/prisma/migrations/20261111193000_f11_session_mfa_policy_ratelimit/migration.sql";
const down = "packages/db/prisma/migrations/20261111193000_f11_session_mfa_policy_ratelimit/down.sql";
const align = "packages/db/prisma/migrations/20261111213000_f11_align_auth_runtime/migration.sql";
const alignDown = "packages/db/prisma/migrations/20261111213000_f11_align_auth_runtime/down.sql";
const required = [migration, down, align, alignDown, "docs/liberacao-producao.md", "docs/f11-integracao-status.md"];
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

console.log("O preflight não aplica migração, não faz deploy e não contacta banco remoto.");
console.log("MFA bloqueante e sessão Prisma estão no código. A ativação na QA depende de F11_MFA_BLOCKING e da migração autorizada.");
process.exit(failed ? 1 : 0);
