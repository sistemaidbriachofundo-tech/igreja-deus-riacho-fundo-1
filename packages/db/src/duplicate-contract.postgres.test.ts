/**
 * PostgreSQL descartável. Só roda com RUN_PG_INTEGRATION=1 e o schema migrado.
 * Não usa banco de HML nem de produção.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const enabled = process.env.RUN_PG_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

(enabled ? describe : describe.skip)("postgres duplicidade de inscrição e lançamento", () => {
  const prisma = new PrismaClient();
  const suffix = Date.now().toString(36);
  const orgId = `org-dup-${suffix}`;
  const churchId = `church-dup-${suffix}`;
  const eventId = `event-dup-${suffix}`;
  const modalityId = `mod-dup-${suffix}`;

  before(async () => {
    await prisma.organization.create({ data: { id: orgId, name: "Org sintética", slug: `org-${suffix}` } });
    await prisma.church.create({ data: { id: churchId, organizationId: orgId, name: "Igreja sintética", slug: `church-${suffix}` } });
    await prisma.portalEvent.create({
      data: {
        id: eventId, organizationId: orgId, churchId, name: "Evento sintético", slug: `evento-${suffix}`,
        startsAt: new Date("2026-12-01T00:00:00.000Z"), status: "PUBLISHED",
      },
    });
    await prisma.eventModality.create({
      data: { id: modalityId, eventId, code: "individual", name: "Individual" },
    });
  });

  after(async () => {
    await prisma.eventParticipationKey.deleteMany({ where: { eventId } });
    await prisma.ledgerEntry.deleteMany({ where: { churchId } });
    await prisma.eventRegistration.deleteMany({ where: { eventId } });
    await prisma.eventModality.deleteMany({ where: { eventId } });
    await prisma.portalEvent.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { email: `dup-${suffix}@example.test` } });
    await prisma.person.deleteMany({ where: { organizationId: orgId } });
    await prisma.church.deleteMany({ where: { id: churchId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("serializa a mesma participação e preserva a inscrição cancelada", async () => {
    const registration = await prisma.eventRegistration.create({
      data: {
        organizationId: orgId, churchId, eventId, modalityId,
        displayName: "Participante sintético", registrantPersonId: null,
        status: "PENDING_PAYMENT", paymentStatus: "PENDING", checkInCode: `a${suffix}`.padEnd(32, "a"),
      },
    });
    const key = `person:sintetico-${suffix}`;
    await prisma.eventParticipationKey.create({
      data: { organizationId: orgId, churchId, eventId, registrationId: registration.id, identityKey: key },
    });
    const rival = await prisma.eventRegistration.create({
      data: {
        organizationId: orgId, churchId, eventId, modalityId,
        displayName: "Outra tentativa", status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK",
        checkInCode: `b${suffix}`.padEnd(32, "b"),
      },
    });
    await assert.rejects(
      () => prisma.eventParticipationKey.create({
        data: { organizationId: orgId, churchId, eventId, registrationId: rival.id, identityKey: key },
      }),
      (error: unknown) => (error as { code?: string }).code === "P2002",
    );
    const [first, second] = await Promise.allSettled([
      prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-reg:${eventId}`}, 0))`;
        const held = await tx.eventParticipationKey.findMany({ where: { eventId, identityKey: key } });
        if (held.length) return "existing";
        await tx.eventParticipationKey.create({
          data: { organizationId: orgId, churchId, eventId, registrationId: registration.id, identityKey: `${key}:race` },
        });
        return "created";
      }),
      prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-reg:${eventId}`}, 0))`;
        const held = await tx.eventParticipationKey.findMany({ where: { eventId, identityKey: `${key}:race` } });
        if (held.length) return "existing";
        await tx.eventParticipationKey.create({
          data: { organizationId: orgId, churchId, eventId, registrationId: rival.id, identityKey: `${key}:race` },
        });
        return "created";
      }),
    ]);
    const values = [first, second].map(result => result.status === "fulfilled" ? result.value : "rejected");
    assert.deepEqual(values.filter(value => value === "created"), ["created"]);
    assert.equal(values.filter(value => value === "existing" || value === "rejected").length, 1);
    await prisma.eventRegistration.update({ where: { id: registration.id }, data: { status: "CANCELLED", paymentStatus: "CANCELLED" } });
    await prisma.eventParticipationKey.deleteMany({ where: { registrationId: registration.id } });
    const historical = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    assert.equal(historical.status, "CANCELLED");
    assert.equal(await prisma.eventParticipationKey.count({ where: { registrationId: registration.id } }), 0);
    assert.equal(await prisma.eventRegistration.count({ where: { eventId } }), 2);
  });

  it("impede o mesmo documento contábil e aceita descrição diferente", async () => {
    const person = await prisma.person.create({
      data: { organizationId: orgId, homeChurchId: churchId, displayName: "Tesoureiro sintético" },
    });
    const user = await prisma.user.create({
      data: { personId: person.id, email: `dup-${suffix}@example.test` },
    });
    const entry = await prisma.ledgerEntry.create({
      data: {
        organizationId: orgId, churchId, entryDate: new Date("2026-11-24T00:00:00.000Z"),
        description: "Conta de energia", status: "PENDING_APPROVAL", amountCents: 1000,
        createdByUserId: user.id, externalDocumentId: `NF-${suffix}`,
      },
    });
    await assert.rejects(
      () => prisma.ledgerEntry.create({
        data: {
          organizationId: orgId, churchId, entryDate: new Date("2026-11-24T00:00:00.000Z"),
          description: "Conta de energia", status: "PENDING_APPROVAL", amountCents: 1000,
          createdByUserId: user.id, externalDocumentId: `NF-${suffix}`,
        },
      }),
      (error: unknown) => (error as { code?: string }).code === "P2002",
    );
    const distinct = await prisma.ledgerEntry.create({
      data: {
        organizationId: orgId, churchId, entryDate: new Date("2026-11-24T00:00:00.000Z"),
        description: "Conta de água", status: "PENDING_APPROVAL", amountCents: 1000,
        createdByUserId: user.id,
      },
    });
    assert.notEqual(distinct.id, entry.id);
    assert.equal(await prisma.ledgerEntry.count({ where: { churchId, externalDocumentId: `NF-${suffix}` } }), 1);
  });
});
