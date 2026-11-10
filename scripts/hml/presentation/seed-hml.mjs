#!/usr/bin/env node
/**
 * Massa fictícia de homologação.
 * Padrão: plano ou dry-run. Não grava no Neon sem as duas confirmações do integrador.
 *
 *   node scripts/hml/presentation/seed-hml.mjs --dry-run
 *   HML_SEED_CI=1 node scripts/hml/presentation/seed-hml.mjs --apply
 *   HML_SEED_CONFIRM=idriacho1_hml HML_SEED_OPERATOR=integrator-j \
 *     node scripts/hml/presentation/seed-hml.mjs --dry-run
 */
import { writeFileSync } from "node:fs";
import { runSeed } from "./apply.mjs";

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith("--"));
const modes = flags.filter((flag) => ["--plan", "--dry-run", "--apply", "--rollback"].includes(flag));

if (flags.includes("--help") || modes.length > 1) {
  console.error(
    "Uso: node scripts/hml/presentation/seed-hml.mjs [--plan|--dry-run|--apply|--rollback] [--inventory-out arquivo.json]",
  );
  process.exit(flags.includes("--help") && modes.length <= 1 ? 0 : 2);
}

const mode = modes.includes("--apply")
  ? "apply"
  : modes.includes("--rollback")
    ? "rollback"
    : modes.includes("--plan")
      ? "plan"
      : "dry-run";

const outFlag = args.indexOf("--inventory-out");
const inventoryOut = outFlag >= 0 ? args[outFlag + 1] : "";

console.error("HOMOLOGAÇÃO — registros fictícios da Igreja de Deus no Riacho Fundo I.");
console.error("Nenhum pagamento, Pix ou mensagem é enviado. Senhas existentes não são alteradas.");

try {
  const report = await runSeed({
    mode,
    databaseUrl: process.env.DATABASE_URL,
    env: process.env,
  });
  const body = JSON.stringify(report, null, 2);
  console.log(body);
  if (inventoryOut) writeFileSync(inventoryOut, body);
} catch (error) {
  const message = error instanceof Error ? error.message : "falha ao preparar a massa";
  console.error(message);
  process.exit(error.exitCode ?? 1);
}
