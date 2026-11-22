#!/usr/bin/env node
/**
 * Massa fictícia da ordem de culto e comprovantes, somente na branch Neon de QA.
 * Não conecta se o alvo não for confirmado. Não altera HML nem produção.
 */
const QA_BRANCH = "br-twilight-bonus-b6moawk7";
const QA_DATABASE = "idriacho1_hml";

export function assertQaSeedTarget(databaseUrl, confirm, branchId) {
  if (confirm !== QA_BRANCH || branchId !== QA_BRANCH) return { ok: false, reason: "SEED_BLOCKED_CONFIRM" };
  let url;
  try { url = new URL(databaseUrl); }
  catch { return { ok: false, reason: "SEED_BLOCKED_URL" }; }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (database !== QA_DATABASE) return { ok: false, reason: "SEED_BLOCKED_DATABASE" };
  if (!url.hostname.endsWith(".neon.tech")) return { ok: false, reason: "SEED_BLOCKED_HOST" };
  const blob = `${url.hostname} ${url.href}`.toLowerCase();
  if (/(hostinger|igrejadeusrf1|prod-db|production)/.test(blob)) return { ok: false, reason: "SEED_BLOCKED_PROD" };
  if (!blob.includes(QA_BRANCH) && !blob.includes("twilight-bonus")) return { ok: false, reason: "SEED_BLOCKED_BRANCH" };
  return { ok: true, host: url.hostname, database };
}

async function main() {
  const verdict = assertQaSeedTarget(process.env.DATABASE_URL ?? "", process.env.OC_QA_SEED_CONFIRM ?? "", process.env.NEON_BRANCH_ID ?? "");
  if (!verdict.ok) {
    console.error(JSON.stringify({ applied: false, ...verdict }));
    process.exit(process.argv.includes("--check") ? 2 : 2);
  }
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify({ applied: false, checked: true, host: verdict.host, database: verdict.database }));
    return;
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const church = await prisma.church.findFirst({ where: { slug: { in: ["riacho-fundo-1", "riacho-fundo-i"] } }, include: { organization: true } });
    if (!church) throw new Error("SEED_BLOCKED_CHURCH");
    const pastor = await prisma.user.findFirst({ where: { grants: { some: { churchId: church.id, role: { code: "PASTOR" } } } } });
    if (!pastor) throw new Error("SEED_BLOCKED_PASTOR");
    const marker = "rf1qa-oc";
    const months = [new Date("2026-12-01T00:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z")];
    const rosters = await prisma.roster.findMany({
      where: { churchId: church.id, status: "PUBLISHED", serviceAt: { gte: months[0], lt: new Date("2027-02-01T00:00:00.000Z") } },
      include: { slots: { include: { assignments: { include: { person: { select: { id: true, displayName: true } } } } } } },
      take: 40,
    });
    let created = 0;
    for (const roster of rosters) {
      const exists = await prisma.serviceOrder.findFirst({ where: { churchId: church.id, serviceAt: roster.serviceAt }, select: { id: true } });
      if (exists) continue;
      const confirmed = roster.slots.flatMap((slot) => slot.assignments.filter((item) => item.status === "CONFIRMED").map((item) => ({ slot, item }))).slice(0, 6);
      await prisma.serviceOrder.create({
        data: {
          organizationId: church.organizationId, churchId: church.id, title: `QA fictício · ${roster.title}`.slice(0, 160),
          serviceAt: roster.serviceAt, notes: `${marker} vinculado à escala publicada, sem dados reais`, status: "DRAFT", kind: "REGULAR",
          createdByUserId: pastor.id,
          items: { create: confirmed.length ? confirmed.map((entry, position) => ({
            position, title: entry.slot.roleLabel, minutes: 10, responsible: entry.item.person.displayName,
            responsiblePersonId: entry.item.personId, roleKey: "escala",
          })) : [{ position: 0, title: "Abertura", minutes: 5, alert: "A definir. Nenhuma pessoa confirmada nesta escala." }] },
        },
      });
      created += 1;
    }
    const specialAt = new Date("2027-01-03T22:00:00.000Z");
    const special = await prisma.serviceOrder.findFirst({ where: { churchId: church.id, serviceAt: specialAt }, select: { id: true } });
    if (!special) {
      await prisma.serviceOrder.create({
        data: {
          organizationId: church.organizationId, churchId: church.id, title: "QA fictício · Culto especial", serviceAt: specialAt,
          notes: `${marker} culto especial de exemplo`, status: "APPROVED", kind: "SPECIAL", createdByUserId: pastor.id, approvedByUserId: pastor.id, approvedAt: new Date(),
          items: { create: [{ position: 0, title: "Ceia", minutes: 20, responsible: null, alert: "A definir" }] },
        },
      });
      created += 1;
    }
    const expenses = await prisma.ledgerEntry.findMany({
      where: { churchId: church.id, OR: [{ id: { startsWith: "rf1qa" } }, { description: { contains: "fict", mode: "insensitive" } }, { description: { contains: "TESTE", mode: "insensitive" } }] },
      take: 5,
    });
    let attachments = 0;
    const pdf = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
    for (const entry of expenses) {
      const key = `ledger/${church.organizationId}/${church.id}/${entry.id}/${marker}-comprovante.pdf`;
      const existing = await prisma.ledgerEntryAttachment.findFirst({ where: { entryId: entry.id, storageKey: key }, select: { id: true } });
      if (existing) continue;
      await prisma.privateFile.upsert({ where: { key }, update: {}, create: { key, bytes: pdf } });
      await prisma.ledgerEntryAttachment.create({
        data: {
          entryId: entry.id, organizationId: church.organizationId, churchId: church.id, uploadedByUserId: pastor.id,
          displayName: "QA - Comprovante ficticio.pdf", contentType: "application/pdf", byteSize: pdf.length, storageKey: key,
        },
      });
      attachments += 1;
    }
    console.log(JSON.stringify({ applied: true, host: verdict.host, database: verdict.database, orders: created, attachments, rosters: rosters.length }));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed-ordem-culto-qa.mjs")) {
  main().catch((error) => {
    console.error(JSON.stringify({ applied: false, reason: error instanceof Error ? error.message : "SEED_FAILED" }));
    process.exit(1);
  });
}
