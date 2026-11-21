/**
 * Massa visual idempotente de DEV: retratos JPEG e eventos com as imagens QA.
 *
 *   node scripts/qa/seed-complete-dev.mjs
 *   node scripts/qa/seed-complete-dev.mjs --report
 *   QA_SEED_CONFIRM=br-twilight-bonus-b6moawk7 IDBRF_RUNTIME_STAGE=qa \
 *     node scripts/qa/seed-complete-dev.mjs --apply
 *
 * O padrão é não gravar. --apply só continua se a URL for o ramo QA
 * br-twilight-bonus-b6moawk7 / idriacho1_hml, ou o Postgres local idriacho1_qa_ci.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { SeedGuardError, QA_BRANCH_ID, QA_PROJECT_ID, assertQaSeedTarget } from "./qa-image-guard.mjs";
import { PERSONA_VIEWS, buildQaImagePlan, publicEventCards } from "./qa-image-catalog.mjs";
import { applyQaImagePlan, renderPlanPortraits } from "./qa-image-apply.mjs";

export const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export function parseSeedArgs(argv) {
  const known = new Set(["--dry-run", "--apply", "--report", "--help"]);
  for (const flag of argv) {
    if (!known.has(flag)) {
      throw new SeedGuardError("Uso: node scripts/qa/seed-complete-dev.mjs [--dry-run] [--apply] [--report]");
    }
  }
  if (argv.includes("--help")) return { mode: "help", report: false };
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new SeedGuardError("BLOQUEADO: use só --apply ou só --dry-run");
  }
  const mode = argv.includes("--apply") ? "apply" : "dry-run";
  return { mode, report: argv.includes("--report") || mode === "dry-run" };
}

export function buildSeedReport(plan, extra = {}) {
  const credentials = { active: 0, revoked: 0, absent: 0 };
  for (const person of plan.people) {
    if (!person.credential) credentials.absent += 1;
    else if (person.credential.status === "REVOKED") credentials.revoked += 1;
    else credentials.active += 1;
  }
  return {
    mode: extra.mode ?? "dry-run",
    persisted: Boolean(extra.persisted),
    place: extra.place ?? "offline",
    sourceCommit: plan.sourceCommit,
    projectId: QA_PROJECT_ID,
    branchId: extra.place === "neon-qa" ? QA_BRANCH_ID : null,
    people: plan.people.length,
    photos: plan.people.length,
    events: {
      future: plan.events.filter((event) => event.when === "future").length,
      past: plan.events.filter((event) => event.when === "past").length,
    },
    registrations: plan.registrations.length,
    tickets: plan.tickets.length,
    payments: plan.payments.length,
    credentials,
    publicEvents: publicEventCards(plan),
    personas: PERSONA_VIEWS.map((persona) => ({
      id: persona.id,
      role: persona.role,
      route: persona.route,
      sees: persona.sees,
    })),
    walkthrough: [
      "Convidado: agenda pública e /eventos/inscricao/?evento=qa-dev-so-para-mocas",
      "Membro: /app/eventos/?evento=qa-dev-so-para-mocas",
      "Secretaria: buscar Pessoa QA 01 (demonstração) e abrir a carteirinha",
      "Tesouraria: eventos qa-dev-oficina e qa-dev-enraizados, só pagamento mock",
      "Editor e publicador: imageUrl /images/qa/events/*.svg nos seis eventos futuros",
    ],
    note: "Nenhuma senha é definida ou impressa. E-mails ficam em @example.test.",
  };
}

export function publicFailure(error) {
  if (error instanceof SeedGuardError) return error.message;
  const message = error instanceof Error ? error.message : "A seed visual de DEV falhou";
  const redacted = message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[conexão]").replace(/[a-z0-9.-]+\.neon\.tech/gi, "[host]");
  if (/password|secret|DATABASE_URL/i.test(redacted)) return "A seed visual de DEV falhou antes de gravar";
  return redacted.slice(0, 300);
}

export async function runSeed(options) {
  const plan = buildQaImagePlan(options.now ?? new Date());
  const target = assertQaSeedTarget({
    mode: options.mode,
    databaseUrl: options.databaseUrl,
    env: options.env ?? process.env,
  });
  if (options.mode !== "apply") {
    return { report: buildSeedReport(plan, { mode: "dry-run", persisted: false, place: "offline" }), plan };
  }
  const portraits = await renderPlanPortraits(plan, options.root ?? repoRoot);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: options.databaseUrl } } });
  try {
    await applyQaImagePlan(prisma, plan, portraits, target);
    return {
      report: buildSeedReport(plan, { mode: "apply", persisted: true, place: target.place }),
      plan,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseSeedArgs(process.argv.slice(2));
  if (args.mode === "help") {
    console.log("Uso: node scripts/qa/seed-complete-dev.mjs [--dry-run] [--apply] [--report]");
    return;
  }
  const { report } = await runSeed({
    mode: args.mode,
    databaseUrl: process.env.DATABASE_URL,
    env: process.env,
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(publicFailure(error));
    process.exitCode = error instanceof SeedGuardError ? error.exitCode : 1;
  });
}
