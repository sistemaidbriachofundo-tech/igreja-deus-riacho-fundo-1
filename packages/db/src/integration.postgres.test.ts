/**
 * Integração Postgres — só roda com RUN_PG_INTEGRATION=1.
 * Valida migrações F2 + invariantes do seed fictício (sem PII real).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createPrismaClient } from "./index";

const enabled = process.env.RUN_PG_INTEGRATION === "1";

(enabled ? describe : describe.skip)("postgres integration F2", () => {
  const prisma = createPrismaClient();

  after(async () => {
    await prisma.$disconnect();
  });

  before(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  it("has admission_documents table from F2 migration", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'admission_documents'
    `;
    assert.equal(rows.length, 1);
  });

  it("seed menor has adult legal guardian in same org", async () => {
    const menor = await prisma.person.findUnique({
      where: { id: "demoPersonMenor01" },
    });
    assert.ok(menor, "demoPersonMenor01 seeded");
    assert.equal(menor!.isMinor, true);
    assert.equal(menor!.legalGuardianPersonId, "demoPersonRiacho01");

    const guardian = await prisma.person.findUnique({
      where: { id: menor!.legalGuardianPersonId! },
    });
    assert.ok(guardian);
    assert.equal(guardian!.isMinor, false);
    assert.equal(guardian!.organizationId, menor!.organizationId);
  });

  it("pilot household links demo family members", async () => {
    const household = await prisma.household.findFirst({
      where: { id: "demoHousehold01" },
      include: { persons: { select: { id: true, isMinor: true } } },
    });
    assert.ok(household, "demoHousehold01");
    const ids = household!.persons.map((p) => p.id);
    assert.ok(ids.includes("demoPersonRiacho01"));
    assert.ok(ids.includes("demoPersonMenor01"));
  });
});
