#!/usr/bin/env node
/**
 * Rascunhos fictícios de Ordem de Culto no Neon de QA.
 * Não cria pessoas. Recusa qualquer URL sem a branch br-twilight-bonus-b6moawk7.
 *
 *   node scripts/qa/seed-service-orders.mjs
 *   node --import tsx scripts/qa/seed-service-orders.mjs --apply
 */
import { pathToFileURL } from "node:url";

const QA_BRANCH = "br-twilight-bonus-b6moawk7";

if (!process.argv.includes("--apply")) {
  console.log(`dry-run: nenhuma escrita. --apply exige DATABASE_URL da branch ${QA_BRANCH}.`);
  process.exit(0);
}
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes(QA_BRANCH)) {
  throw new Error(`BLOQUEADO: a gravação de ordens de culto só roda na branch Neon ${QA_BRANCH}.`);
}

const { PrismaClient } = await import("@prisma/client");
const domain = await import(pathToFileURL(new URL("../../apps/api/src/service-orders/service-order-planning.domain.ts", import.meta.url)).href);
const prisma = new PrismaClient();
try {
  const church = await prisma.church.findFirst({ where: { slug: "riacho-fundo-1" }, select: { id: true, organizationId: true } });
  if (!church) throw new Error("Congregação de QA não encontrada.");
  const pastor = await prisma.grant.findFirst({ where: { churchId: church.id, role: { code: "PASTOR" } }, select: { userId: true } });
  if (!pastor) throw new Error("Nenhum pastor da congregação para assinar os rascunhos.");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
  const [year, month] = parts.split("-").map(Number);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const rules = domain.RF1_SERVICE_ORDER_DEFAULTS;
  let created = 0;
  for (const period of [{ year, month }, next]) {
    for (const service of domain.monthServiceDates(period.year, period.month, rules)) {
      if (domain.exceptionFor(rules, service.serviceAt)?.kind === "SKIP") continue;
      const serviceAt = new Date(service.serviceAt);
      const found = await prisma.serviceOrder.findFirst({ where: { churchId: church.id, serviceAt }, select: { id: true } });
      if (found) continue;
      await prisma.serviceOrder.create({
        data: {
          organizationId: church.organizationId, churchId: church.id, title: service.title, serviceAt,
          status: "DRAFT", createdByUserId: pastor.userId, notes: "Rascunho fictício de QA, sem voluntário inventado.",
          items: { create: domain.buildServiceMoments(null, null, null, null, rules).map((item, position) => ({
            position, title: item.title, minutes: item.minutes, responsible: item.responsible, notes: item.notes,
          })) },
        },
      });
      created += 1;
    }
  }
  console.log(JSON.stringify({ branch: QA_BRANCH, created }));
} finally {
  await prisma.$disconnect();
}
