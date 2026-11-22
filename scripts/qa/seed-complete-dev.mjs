#!/usr/bin/env node
/**
 * Massa sintética idempotente de QA.
 * Padrão: dry-run offline. --apply só no ramo Neon confirmado.
 *
 *   node scripts/qa/seed-complete-dev.mjs
 *   node scripts/qa/seed-complete-dev.mjs --dry-run --report /tmp/qa-seed-report.json
 */
import { writeFileSync } from "node:fs";
import { runSeed } from "./apply.mjs";

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith("--"));
const modes = flags.filter((flag) => ["--dry-run", "--apply", "--report"].includes(flag) || flag === "--report");
if (flags.includes("--help")) {
  console.error("Uso: node scripts/qa/seed-complete-dev.mjs [--dry-run|--apply] [--report arquivo.json]");
  process.exit(0);
}
if (flags.includes("--apply") && flags.includes("--dry-run")) {
  console.error("Escolha só um modo: --dry-run ou --apply.");
  process.exit(2);
}

const mode = flags.includes("--apply") ? "apply" : flags.includes("--report") && !flags.includes("--dry-run") ? "report" : "dry-run";
const reportFlag = args.indexOf("--report");
const reportPath = reportFlag >= 0 ? args[reportFlag + 1] : "";
if (reportFlag >= 0 && !reportPath) {
  console.error("--report precisa de um caminho de arquivo.");
  process.exit(2);
}

console.error("QA — registros fictícios qacomp_. Nenhum pagamento, Pix ou e-mail é enviado.");

try {
  const report = await runSeed({
    mode,
    databaseUrl: process.env.DATABASE_URL,
    env: process.env,
  });
  const body = JSON.stringify(report, null, 2);
  if (body.includes("postgresql://") || body.includes("password")) {
    throw new Error("Relatório bloqueado porque incluiria segredo");
  }
  console.log(body);
  if (reportPath) writeFileSync(reportPath, body);
} catch (error) {
  const message = error instanceof Error ? error.message : "falha ao preparar a massa";
  console.error(message);
  process.exit(error.exitCode ?? 1);
}
