/**
 * Grava só registros qaImg*. Não apaga linha existente e não altera outro cadastro.
 */
import { join } from "node:path";
import { SeedGuardError, assertLiveQaIdentity } from "./qa-image-guard.mjs";
import { QA_CHURCH_SLUG, QA_ORG_SLUG } from "./qa-image-catalog.mjs";
import { renderQaPortrait } from "./qa-image-portraits.mjs";

const LIVE_IDENTITY_SQL = "SELECT current_database() AS database_name, current_setting('neon.branch_id', true) AS branch_id";

function asDate(value) {
  return value ? new Date(value) : null;
}

function dateOnly(value) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

async function requireScope(prisma) {
  const organization = await prisma.organization.findUnique({ where: { slug: QA_ORG_SLUG } });
  if (!organization) {
    throw new SeedGuardError("BLOQUEADO: a organização piloto não existe. A seed não cria congregação.");
  }
  const church = await prisma.church.findUnique({
    where: { organizationId_slug: { organizationId: organization.id, slug: QA_CHURCH_SLUG } },
  });
  if (!church || church.organizationId !== organization.id) {
    throw new SeedGuardError("BLOQUEADO: a congregação piloto não existe. A seed não cria congregação.");
  }
  return { organizationId: organization.id, churchId: church.id };
}

async function assertOwnedPerson(prisma, person) {
  const byId = await prisma.person.findUnique({ where: { id: person.id } });
  if (byId && byId.email !== person.email) {
    throw new SeedGuardError("BLOQUEADO: um ID QA já pertence a outro cadastro");
  }
  const byEmail = await prisma.person.findFirst({ where: { email: person.email } });
  if (byEmail && byEmail.id !== person.id) {
    throw new SeedGuardError("BLOQUEADO: um e-mail de demonstração já pertence a outro cadastro");
  }
}

async function assertOwnedEvent(prisma, churchId, event) {
  const found = await prisma.portalEvent.findUnique({
    where: { churchId_slug: { churchId, slug: event.slug } },
  });
  if (found && found.id !== event.id) {
    throw new SeedGuardError("BLOQUEADO: um slug de demonstração já pertence a outro evento");
  }
}

function assertSameId(found, id) {
  if (found && found.id !== id) {
    throw new SeedGuardError("BLOQUEADO: uma chave QA já pertence a outro registro");
  }
}

async function assertOwnedRows(prisma, plan, churchId) {
  const household = await prisma.household.findUnique({ where: { id: plan.household.id } });
  if (household && household.churchId !== churchId) {
    throw new SeedGuardError("BLOQUEADO: a família QA já pertence a outra congregação");
  }
  for (const person of plan.people) {
    if (!person.membership) continue;
    const membership = await prisma.churchMembership.findUnique({
      where: { personId_churchId: { personId: person.id, churchId } },
    });
    assertSameId(membership, person.membership.id);
    if (!person.credential) continue;
    const token = await prisma.memberCredential.findUnique({ where: { opaqueToken: person.credential.opaqueToken } });
    assertSameId(token, person.credential.id);
  }
  for (const item of plan.registrations) {
    const found = await prisma.eventRegistration.findUnique({ where: { checkInCode: item.checkInCode } });
    assertSameId(found, item.id);
  }
  for (const item of plan.tickets) {
    const found = await prisma.eventParticipantTicket.findUnique({ where: { code: item.code } });
    assertSameId(found, item.id);
  }
}

export async function renderPlanPortraits(plan, root) {
  const portraits = new Map();
  for (const person of plan.people) {
    const jpeg = await renderQaPortrait(join(root, "apps/web/public/images/qa/people", person.file));
    portraits.set(person.id, jpeg);
  }
  return portraits;
}

export async function applyQaImagePlan(prisma, plan, portraits, target) {
  const run = async (tx) => {
    const identity = await tx.$queryRawUnsafe(LIVE_IDENTITY_SQL);
    assertLiveQaIdentity(identity, target);
    const scope = await requireScope(tx);
    for (const person of plan.people) await assertOwnedPerson(tx, person);
    for (const event of plan.events) await assertOwnedEvent(tx, scope.churchId, event);
    await assertOwnedRows(tx, plan, scope.churchId);

    await tx.household.upsert({
      where: { id: plan.household.id },
      create: {
        id: plan.household.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        label: plan.household.label,
      },
      update: { label: plan.household.label, organizationId: scope.organizationId, churchId: scope.churchId },
    });

    for (const person of plan.people) {
      const data = {
        organizationId: scope.organizationId,
        homeChurchId: scope.churchId,
        householdId: person.household ? plan.household.id : null,
        displayName: person.displayName,
        email: person.email,
        address: person.household ? plan.household.address : null,
        birthDate: dateOnly(person.birthDate),
        sex: person.sex,
        status: "ACTIVE",
        kind: person.kind,
        isMinor: false,
      };
      await tx.person.upsert({
        where: { id: person.id },
        create: { id: person.id, ...data },
        update: data,
      });
      await tx.personPhoto.upsert({
        where: { personId: person.id },
        create: { personId: person.id, jpeg: portraits.get(person.id) },
        update: { jpeg: portraits.get(person.id) },
      });
      if (person.membership) {
        await tx.churchMembership.upsert({
          where: { id: person.membership.id },
          create: {
            id: person.membership.id,
            personId: person.id,
            churchId: scope.churchId,
            organizationId: scope.organizationId,
            status: person.membership.status,
            notes: person.membership.notes,
          },
          update: { status: person.membership.status, notes: person.membership.notes },
        });
      }
      if (person.credential) {
        await tx.memberCredential.upsert({
          where: { id: person.credential.id },
          create: {
            id: person.credential.id,
            membershipId: person.membership.id,
            personId: person.id,
            churchId: scope.churchId,
            organizationId: scope.organizationId,
            status: person.credential.status,
            opaqueToken: person.credential.opaqueToken,
            revokedAt: asDate(person.credential.revokedAt),
          },
          update: {
            status: person.credential.status,
            opaqueToken: person.credential.opaqueToken,
            revokedAt: asDate(person.credential.revokedAt),
          },
        });
      }
    }

    for (const event of plan.events) {
      const data = {
        name: event.name,
        description: event.description,
        imageUrl: event.imageUrl,
        startsAt: asDate(event.startsAt),
        endsAt: asDate(event.endsAt),
        locationText: event.locationText,
        status: event.status,
        featuredOnHome: false,
        ticketPolicy: event.ticketPolicy,
        publishedAt: asDate(event.publishedAt),
        cancelledAt: asDate(event.cancelledAt),
      };
      await tx.portalEvent.upsert({
        where: { id: event.id },
        create: {
          id: event.id,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          slug: event.slug,
          ...data,
        },
        update: data,
      });
    }
    for (const modality of plan.modalities) {
      const data = {
        name: modality.name,
        kind: modality.kind,
        minPartySize: modality.minPartySize,
        maxPartySize: modality.maxPartySize,
        capacity: modality.capacity,
        sortOrder: modality.sortOrder,
      };
      await tx.eventModality.upsert({
        where: { id: modality.id },
        create: { id: modality.id, eventId: modality.eventId, code: modality.code, ...data },
        update: data,
      });
    }
    for (const item of plan.lots) {
      const data = {
        name: item.name,
        capacity: item.capacity,
        priceCents: item.priceCents,
        currency: item.currency,
        opensAt: asDate(item.opensAt),
        closesAt: asDate(item.closesAt),
        status: item.status,
        paymentProvider: item.paymentProvider,
        sortOrder: item.sortOrder,
      };
      await tx.eventLot.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          eventId: item.eventId,
          modalityId: item.modalityId,
          code: item.code,
          ...data,
        },
        update: data,
      });
    }
    for (const item of plan.registrations) {
      const data = {
        displayName: item.displayName,
        notificationEmail: item.notificationEmail,
        participantRoster: item.participantRoster,
        partySize: item.partySize,
        status: item.status,
        paymentStatus: item.paymentStatus,
        checkedInAt: asDate(item.checkedInAt),
        cancelledAt: asDate(item.cancelledAt),
      };
      await tx.eventRegistration.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          registrantPersonId: item.personId,
          eventId: item.eventId,
          modalityId: item.modalityId,
          lotId: item.lotId,
          checkInCode: item.checkInCode,
          isMinor: false,
          ...data,
        },
        update: data,
      });
    }
    for (const item of plan.tickets) {
      const data = {
        participantName: item.participantName,
        participantEmail: item.participantEmail,
        checkedInAt: asDate(item.checkedInAt),
      };
      await tx.eventParticipantTicket.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          registrationId: item.registrationId,
          position: item.position,
          code: item.code,
          ...data,
        },
        update: data,
      });
    }
    for (const item of plan.payments) {
      const data = {
        amountCents: item.amountCents,
        currency: item.currency,
        status: item.status,
        providerRef: item.providerRef,
        paymentProvider: item.paymentProvider,
        dueOn: dateOnly(item.dueOn),
        confirmedAt: asDate(item.confirmedAt),
      };
      await tx.eventPaymentIntent.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          eventId: item.eventId,
          registrationId: item.registrationId,
          lotId: item.lotId,
          attemptRef: item.attemptRef,
          ...data,
        },
        update: data,
      });
    }
    return scope;
  };
  if (typeof prisma.$transaction === "function") return prisma.$transaction(run);
  return run(prisma);
}
