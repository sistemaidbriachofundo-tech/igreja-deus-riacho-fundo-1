/**
 * Aplica ou reverte a massa fictícia.
 * Não envia mensagem, Pix ou pagamento. Não altera senha.
 */
import { randomUUID } from "node:crypto";
import { buildCatalog, PILOT_CHURCH_SLUG, PILOT_ORG_SLUG, SEED_PREFIX } from "./catalog.mjs";
import { assertLiveDatabaseName, assertSeedTarget } from "./guard.mjs";

const MANIFEST_ACTION = "hml.presentation_seed.apply";

class DryRunComplete extends Error {
  constructor(report) {
    super("dry-run");
    this.name = "DryRunComplete";
    this.report = report;
  }
}

export async function runSeed({ mode, databaseUrl, env = process.env }) {
  const decision = assertSeedTarget({ databaseUrl, mode, env });
  if (decision.offline) {
    const catalog = buildCatalog();
    return {
      mode: "offline-plan",
      persisted: false,
      rolledBack: false,
      databaseName: null,
      place: "offline",
      banner: "HOMOLOGAÇÃO — plano offline. Nenhum banco foi contactado.",
      planned: summary(catalog),
      ledgerPosition: catalog.ledgerPosition,
      participation: catalog.participation.counts,
    };
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: ["error"] });
  try {
    const rows = await prisma.$queryRaw`SELECT current_database() AS name`;
    const liveName = rows[0]?.name;
    assertLiveDatabaseName(liveName, decision.databaseName);
    try {
      const report = await prisma.$transaction(
        async (tx) => {
          const result =
            mode === "rollback"
              ? await rollback(tx)
              : await apply(tx, { place: decision.place });
          if (mode === "dry-run") throw new DryRunComplete(result);
          return result;
        },
        { timeout: 120_000, maxWait: 15_000 },
      );
      return {
        ...report,
        mode,
        persisted: true,
        rolledBack: false,
        databaseName: decision.databaseName,
        place: decision.place,
      };
    } catch (error) {
      if (error instanceof DryRunComplete) {
        return {
          ...error.report,
          mode: "dry-run",
          persisted: false,
          rolledBack: true,
          databaseName: decision.databaseName,
          place: decision.place,
        };
      }
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function apply(tx, { place }) {
  const catalog = buildCatalog();
  const scope = await resolveScope(tx, place);
  await assertNovemberOpen(tx, scope.churchId);
  const before = await inventory(tx);
  const preservedBefore = before.preservedPersons;

  for (const household of catalog.households) {
    await tx.household.upsert({
      where: { id: household.id },
      update: { label: household.label },
      create: {
        id: household.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        label: household.label,
      },
    });
  }

  for (const person of catalog.people) {
    if (person.email) {
      const clash = await tx.person.findFirst({
        where: {
          organizationId: scope.organizationId,
          email: person.email,
          NOT: { id: person.id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new Error(
          `BLOQUEADO: ${person.email} já pertence a outro cadastro. A pessoa existente não foi alterada.`,
        );
      }
    }
    const data = {
      displayName: person.displayName,
      email: person.email,
      homeChurchId: scope.churchId,
      organizationId: scope.organizationId,
      householdId: person.householdId,
      status: "ACTIVE",
      kind: person.kind,
      isMinor: person.isMinor,
      legalGuardianPersonId: person.legalGuardianPersonId,
      photoStorageKey: person.photoStorageKey,
    };
    await tx.person.upsert({
      where: { id: person.id },
      update: data,
      create: { id: person.id, ...data },
    });
  }

  for (const person of catalog.people.filter((item) => item.kind === "MEMBER")) {
    await tx.churchMembership.upsert({
      where: { id: `${SEED_PREFIX}cm_${person.slug}` },
      update: { status: "ACTIVE", leftAt: null },
      create: {
        id: `${SEED_PREFIX}cm_${person.slug}`,
        personId: person.id,
        churchId: scope.churchId,
        organizationId: scope.organizationId,
        status: "ACTIVE",
        joinedAt: new Date("2024-03-10T12:00:00.000Z"),
      },
    });
    await tx.admissionProtocol.upsert({
      where: { id: `${SEED_PREFIX}adm_${person.slug}` },
      update: {
        status: "APPROVED",
        modality: person.isMinor ? "OUTRO" : "BATISMO",
        currentStep: "pastor",
        modalityRecorded: true,
        documentsComplete: true,
        secretariaApproved: true,
        pastorApproved: true,
      },
      create: {
        id: `${SEED_PREFIX}adm_${person.slug}`,
        personId: person.id,
        membershipId: `${SEED_PREFIX}cm_${person.slug}`,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        status: "APPROVED",
        modality: person.isMinor ? "OUTRO" : "BATISMO",
        currentStep: "pastor",
        modalityRecorded: true,
        documentsComplete: true,
        secretariaApproved: true,
        pastorApproved: true,
      },
    });
  }

  const actors = await resolveActors(tx, scope.organizationId);
  for (const credential of catalog.credentials) {
    const existing = await tx.memberCredential.findUnique({ where: { id: credential.id } });
    if (existing) continue;
    const active = await tx.memberCredential.findFirst({
      where: { membershipId: credential.membershipId, status: "ACTIVE" },
      select: { id: true },
    });
    if (active) continue;
    await tx.memberCredential.create({
      data: {
        id: credential.id,
        membershipId: credential.membershipId,
        personId: credential.personId,
        churchId: scope.churchId,
        organizationId: scope.organizationId,
        status: "ACTIVE",
        opaqueToken: credential.opaqueToken,
        issuedByUserId: actors[0],
        issuedAt: new Date("2026-11-01T12:00:00.000Z"),
      },
    });
  }

  const ministryIds = new Map();
  const ministryCreated = [];
  for (const ministry of catalog.ministries) {
    const resolved = await resolveMinistry(tx, scope, ministry);
    ministryIds.set(ministry.key, resolved.id);
    if (resolved.created) ministryCreated.push(ministry.key);
  }

  for (const membership of catalog.memberships) {
    await tx.ministryMembership.upsert({
      where: { id: membership.id },
      update: {
        role: membership.role,
        status: membership.status,
        source: membership.source,
        endedAt: membership.endedAt ? new Date(membership.endedAt) : null,
      },
      create: {
        id: membership.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        ministryId: ministryIds.get(membership.ministry),
        personId: membership.personId,
        role: membership.role,
        status: membership.status,
        source: membership.source,
        startedAt: new Date("2026-08-01T12:00:00.000Z"),
        endedAt: membership.endedAt ? new Date(membership.endedAt) : null,
      },
    });
  }

  for (const window of catalog.availability) {
    await tx.volunteerAvailability.upsert({
      where: { id: window.id },
      update: {
        weekday: window.weekday,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        active: true,
      },
      create: {
        id: window.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        personId: window.personId,
        weekday: window.weekday,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        active: true,
      },
    });
  }
  for (const impediment of catalog.impediments) {
    await tx.volunteerImpediment.upsert({
      where: { id: impediment.id },
      update: {
        startsAt: new Date(impediment.startsAt),
        endsAt: new Date(impediment.endsAt),
      },
      create: {
        id: impediment.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        personId: impediment.personId,
        startsAt: new Date(impediment.startsAt),
        endsAt: new Date(impediment.endsAt),
      },
    });
  }

  for (const roster of catalog.rosters) {
    await tx.roster.upsert({
      where: { id: roster.id },
      update: {
        title: roster.title,
        serviceAt: new Date(roster.serviceAt),
        status: roster.status,
        ministryId: ministryIds.get(roster.ministry),
      },
      create: {
        id: roster.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        ministryId: ministryIds.get(roster.ministry),
        title: roster.title,
        serviceAt: new Date(roster.serviceAt),
        status: roster.status,
      },
    });
    for (const slot of roster.slots) {
      await tx.rosterSlot.upsert({
        where: { id: slot.id },
        update: {
          roleLabel: slot.roleLabel,
          requiresCouple: slot.requiresCouple,
          sortOrder: slot.sortOrder,
        },
        create: {
          id: slot.id,
          rosterId: roster.id,
          roleLabel: slot.roleLabel,
          requiresCouple: slot.requiresCouple,
          sortOrder: slot.sortOrder,
        },
      });
      await writeAssignment(tx, slot.id, slot.assignment);
      if (slot.assignment.substitute) {
        await writeAssignment(tx, slot.id, slot.assignment.substitute);
      }
    }
  }

  for (const event of catalog.events) {
    await tx.portalEvent.upsert({
      where: { id: event.id },
      update: {
        name: event.name,
        description: event.description,
        startsAt: new Date(event.startsAt),
        endsAt: new Date(event.endsAt),
        locationText: event.locationText,
        status: event.status,
        featuredOnHome: event.featuredOnHome,
        ministryId: ministryIds.get(event.ministry) ?? null,
        imageUrl: `/images/synthetic/${event.imageFile}`,
      },
      create: {
        id: event.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        ministryId: ministryIds.get(event.ministry) ?? null,
        name: event.name,
        slug: event.slug,
        description: event.description,
        imageUrl: `/images/synthetic/${event.imageFile}`,
        startsAt: new Date(event.startsAt),
        endsAt: new Date(event.endsAt),
        locationText: event.locationText,
        status: event.status,
        featuredOnHome: event.featuredOnHome,
        publishedAt: new Date("2026-11-01T12:00:00.000Z"),
      },
    });
    for (const modality of event.modalities) {
      await tx.eventModality.upsert({
        where: { id: modality.id },
        update: {
          name: modality.name,
          kind: modality.kind,
          capacity: modality.capacity,
          minPartySize: modality.minPartySize,
          maxPartySize: modality.maxPartySize,
        },
        create: {
          id: modality.id,
          eventId: event.id,
          code: modality.code,
          name: modality.name,
          kind: modality.kind,
          capacity: modality.capacity,
          minPartySize: modality.minPartySize,
          maxPartySize: modality.maxPartySize,
        },
      });
    }
    for (const lot of event.lots) {
      const modality = event.modalities.find((item) => item.code === lot.modalityCode);
      await tx.eventLot.upsert({
        where: { id: lot.id },
        update: {
          name: lot.name,
          priceCents: lot.priceCents,
          status: lot.status,
          capacity: lot.capacity,
        },
        create: {
          id: lot.id,
          eventId: event.id,
          modalityId: modality.id,
          code: lot.code,
          name: lot.name,
          capacity: lot.capacity,
          priceCents: lot.priceCents,
          currency: "BRL",
          status: lot.status,
        },
      });
    }
    for (const registration of event.registrations) {
      const modality = event.modalities.find((item) => item.code === registration.modalityCode);
      const lot = event.lots.find((item) => item.code === registration.lotCode);
      await tx.eventRegistration.upsert({
        where: { id: registration.id },
        update: {
          displayName: registration.displayName,
          status: registration.status,
          paymentStatus: registration.paymentStatus,
          partySize: registration.partySize,
          isMinor: registration.isMinor,
          guardianDisplayName: registration.guardianDisplayName,
          guardianAuthStatus: registration.guardian ? "AUTHORIZED" : "NOT_REQUIRED",
          checkedInAt: registration.checkedInAt ? new Date(registration.checkedInAt) : null,
          cancelledAt: registration.cancelledAt ? new Date(registration.cancelledAt) : null,
        },
        create: {
          id: registration.id,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          eventId: event.id,
          modalityId: modality.id,
          lotId: lot.id,
          displayName: registration.displayName,
          partySize: registration.partySize,
          isMinor: registration.isMinor,
          guardianDisplayName: registration.guardianDisplayName,
          guardianAuthStatus: registration.guardian ? "AUTHORIZED" : "NOT_REQUIRED",
          guardianAuthorizedAt: registration.guardian
            ? new Date(registration.guardian.authorizedAt)
            : null,
          status: registration.status,
          paymentStatus: registration.paymentStatus,
          checkInCode: registration.checkInCode,
          checkedInAt: registration.checkedInAt ? new Date(registration.checkedInAt) : null,
          cancelledAt: registration.cancelledAt ? new Date(registration.cancelledAt) : null,
        },
      });
      if (registration.guardian) {
        await tx.eventGuardianAuthorization.upsert({
          where: { id: registration.guardian.id },
          update: { status: "AUTHORIZED" },
          create: {
            id: registration.guardian.id,
            organizationId: scope.organizationId,
            churchId: scope.churchId,
            registrationId: registration.id,
            guardianDisplayName: registration.guardianDisplayName,
            status: "AUTHORIZED",
            acknowledgmentText: registration.guardian.acknowledgmentText,
            authorizedAt: new Date(registration.guardian.authorizedAt),
            authorizedByUserId: actors[0],
          },
        });
      }
      if (registration.payment) {
        await tx.eventPaymentIntent.upsert({
          where: { id: registration.payment.id },
          update: { status: registration.payment.status, amountCents: registration.payment.amountCents },
          create: {
            id: registration.payment.id,
            organizationId: scope.organizationId,
            churchId: scope.churchId,
            eventId: event.id,
            registrationId: registration.id,
            lotId: lot.id,
            amountCents: registration.payment.amountCents,
            currency: "BRL",
            status: registration.payment.status,
            providerRef: registration.payment.providerRef,
          },
        });
      }
    }
  }

  const accountIds = new Map();
  for (const account of catalog.accounts) {
    const existing = await tx.ledgerAccount.findUnique({
      where: { churchId_code: { churchId: scope.churchId, code: account.code } },
      select: { id: true },
    });
    if (existing) {
      accountIds.set(account.code, existing.id);
      continue;
    }
    await tx.ledgerAccount.create({
      data: {
        id: account.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        code: account.code,
        name: account.name,
        type: account.type,
        active: true,
      },
    });
    accountIds.set(account.code, account.id);
  }

  const fund = await reuseOrCreate(tx.fund, {
    id: catalog.fund.id,
    where: { churchId_code: { churchId: scope.churchId, code: catalog.fund.code } },
    create: {
      id: catalog.fund.id,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      code: catalog.fund.code,
      name: catalog.fund.name,
    },
  });
  const costCenter = await reuseOrCreate(tx.costCenter, {
    id: catalog.costCenter.id,
    where: { churchId_code: { churchId: scope.churchId, code: catalog.costCenter.code } },
    create: {
      id: catalog.costCenter.id,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      code: catalog.costCenter.code,
      name: catalog.costCenter.name,
    },
  });

  const approvedAt = new Date("2026-11-09T18:00:00.000Z");
  for (const entry of catalog.ledgerEntries) {
    const data = {
      description: entry.description,
      entryDate: new Date(`${entry.entryDate}T00:00:00.000Z`),
      status: "APPROVED",
      amountCents: entry.amountCents,
      competenceYear: entry.competenceYear,
      competenceMonth: entry.competenceMonth,
      fundId: fund.id,
      costCenterId: costCenter.id,
      submittedAt: approvedAt,
      firstApprovedByUserId: actors[1],
      firstApprovedAt: approvedAt,
      secondApprovedByUserId: actors[2],
      secondApprovedAt: approvedAt,
    };
    await tx.ledgerEntry.upsert({
      where: { id: entry.id },
      update: data,
      create: {
        id: entry.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        createdByUserId: actors[0],
        ...data,
      },
    });
    for (const line of entry.lines) {
      await tx.ledgerEntryLine.upsert({
        where: { id: line.id },
        update: { amountCents: line.amountCents, side: line.side },
        create: {
          id: line.id,
          entryId: entry.id,
          accountId: accountIds.get(line.code),
          side: line.side,
          amountCents: line.amountCents,
          memo: entry.description,
        },
      });
    }
  }

  await tx.budget.upsert({
    where: { id: catalog.budget.id },
    update: { status: "ACTIVE" },
    create: {
      id: catalog.budget.id,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      year: catalog.budget.year,
      title: catalog.budget.title,
      status: catalog.budget.status,
      createdByUserId: actors[0],
    },
  });
  await tx.budgetLine.upsert({
    where: { id: catalog.budget.line.id },
    update: { plannedCents: catalog.budget.line.plannedCents },
    create: {
      id: catalog.budget.line.id,
      budgetId: catalog.budget.id,
      accountId: accountIds.get(catalog.budget.line.accountCode),
      fundId: fund.id,
      costCenterId: costCenter.id,
      plannedCents: catalog.budget.line.plannedCents,
      notes: catalog.budget.line.notes,
    },
  });

  await tx.smallGroup.upsert({
    where: { id: catalog.smallGroup.id },
    update: { name: catalog.smallGroup.name, meetsAtHint: catalog.smallGroup.meetsAtHint },
    create: {
      id: catalog.smallGroup.id,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      name: catalog.smallGroup.name,
      leaderPersonId: catalog.smallGroup.leaderPersonId,
      meetsAtHint: catalog.smallGroup.meetsAtHint,
    },
  });
  for (const member of catalog.smallGroup.members) {
    await tx.smallGroupMember.upsert({
      where: { id: member.id },
      update: { role: member.role },
      create: {
        id: member.id,
        groupId: catalog.smallGroup.id,
        personId: member.personId,
        role: member.role,
      },
    });
  }
  await tx.groupMeeting.upsert({
    where: { id: catalog.smallGroup.meeting.id },
    update: { notes: catalog.smallGroup.meeting.notes },
    create: {
      id: catalog.smallGroup.meeting.id,
      groupId: catalog.smallGroup.id,
      occurredAt: new Date(catalog.smallGroup.meeting.occurredAt),
      notes: catalog.smallGroup.meeting.notes,
    },
  });
  for (const attendance of catalog.smallGroup.meeting.attendances) {
    await tx.groupMeetingAttendance.upsert({
      where: { id: attendance.id },
      update: { present: attendance.present },
      create: {
        id: attendance.id,
        meetingId: catalog.smallGroup.meeting.id,
        personId: attendance.personId,
        present: attendance.present,
      },
    });
  }

  await assertBalanced(tx);
  const after = await inventory(tx);
  if (after.preservedPersons !== preservedBefore) {
    throw new Error("BLOQUEADO: a quantidade de pessoas pré-existentes mudou");
  }
  const report = {
    before,
    after,
    delta: delta(before, after),
    preservedPersons: after.preservedPersons,
    ministriesReused: catalog.ministries.map((item) => item.key).filter((key) => !ministryCreated.includes(key)),
    ministriesCreated: ministryCreated,
    ledgerPosition: catalog.ledgerPosition,
    participation: catalog.participation.counts,
    images: {
      directory: "apps/web/public/images/synthetic",
      source: "SVG geométrico gerado no repositório. Sem fotografia, sem Unsplash, sem pessoa real.",
      avatars: catalog.people.length,
    },
    paymentsSent: false,
    messagesSent: false,
    passwordsReset: false,
  };
  const manifestId = `${SEED_PREFIX}audit_${randomUUID()}`;
  await tx.auditLog.create({
    data: {
      id: manifestId,
      actorUserId: null,
      action: MANIFEST_ACTION,
      resourceType: "hml_presentation_seed",
      resourceId: manifestId,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      metadata: report,
    },
  });
  return report;
}

async function writeAssignment(tx, slotId, assignment) {
  const data = {
    personId: assignment.personId,
    partnerPersonId: assignment.partnerPersonId ?? null,
    status: assignment.status,
    substituteForId: assignment.substituteForId ?? null,
    confirmedAt: assignment.status === "CONFIRMED" ? new Date("2026-11-01T12:00:00.000Z") : null,
    declinedAt: assignment.status === "DECLINED" ? new Date("2026-11-01T12:00:00.000Z") : null,
  };
  await tx.rosterAssignment.upsert({
    where: { id: assignment.id },
    update: data,
    create: { id: assignment.id, slotId, ...data },
  });
}

async function resolveScope(tx, place) {
  let org = await tx.organization.findUnique({ where: { slug: PILOT_ORG_SLUG } });
  if (!org && place !== "ci-local") {
    throw new Error("BLOQUEADO: organização piloto ausente no Neon. O script não cria outra.");
  }
  if (!org) {
    org = await tx.organization.create({
      data: {
        name: "Igreja de Deus — Riacho Fundo I",
        slug: PILOT_ORG_SLUG,
      },
    });
  }
  let church = await tx.church.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: PILOT_CHURCH_SLUG } },
  });
  if (!church && place !== "ci-local") {
    throw new Error("BLOQUEADO: congregação piloto ausente no Neon. O script não cria outra.");
  }
  if (!church) {
    church = await tx.church.create({
      data: {
        organizationId: org.id,
        name: "Riacho Fundo I",
        slug: PILOT_CHURCH_SLUG,
      },
    });
  }
  return { organizationId: org.id, churchId: church.id };
}

async function assertNovemberOpen(tx, churchId) {
  const period = await tx.accountingPeriod.findUnique({
    where: { churchId_year_month: { churchId, year: 2026, month: 11 } },
    select: { status: true },
  });
  if (period?.status === "CLOSED") {
    throw new Error("BLOQUEADO: competência novembro/2026 está fechada. Nenhum lançamento foi gravado.");
  }
}

async function resolveActors(tx, organizationId) {
  const existing = await tx.user.findMany({
    where: { person: { organizationId } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: 3,
  });
  const ids = existing.map((user) => user.id);
  const candidates = ["joao-carvalho", "maria-ferreira", "paulo-mendes"];
  for (const slug of candidates) {
    if (ids.length >= 3) break;
    const personId = `${SEED_PREFIX}person_${slug}`;
    const email = `${slug}@example.test`;
    const id = `${SEED_PREFIX}user_${slug}`;
    const already = await tx.user.findFirst({
      where: { OR: [{ id }, { email }, { personId }] },
      select: { id: true },
    });
    if (already) {
      if (!ids.includes(already.id)) ids.push(already.id);
      continue;
    }
    await tx.user.create({
      data: {
        id,
        personId,
        email,
        status: "DISABLED",
        passwordHash: null,
      },
    });
    ids.push(id);
  }
  if (new Set(ids).size < 3) {
    throw new Error("BLOQUEADO: faltam três usuários distintos para a dupla aprovação. Senhas não foram alteradas.");
  }
  return ids.slice(0, 3);
}

async function resolveMinistry(tx, scope, ministry) {
  const existing = await tx.ministry.findMany({
    where: { organizationId: scope.organizationId, churchId: scope.churchId },
    select: { id: true, slug: true, name: true },
  });
  const bySlug = existing.find((row) => ministry.slugs.includes(row.slug));
  if (bySlug) return { id: bySlug.id, created: false };
  const byName = existing.find((row) => {
    const name = row.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    return ministry.nameHints.some((hint) => name.includes(hint));
  });
  if (byName) return { id: byName.id, created: false };
  const leader = buildCatalog().memberships.find(
    (item) => item.ministry === ministry.key && item.role === "LIDER" && item.status === "ATIVO",
  );
  await tx.ministry.create({
    data: {
      id: ministry.createdId,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      name: ministry.name,
      slug: ministry.slugs[0],
      description: ministry.description,
      scheduleText: ministry.scheduleText,
      coverImageUrl: `/images/synthetic/${ministry.coverFile}`,
      galleryUrls: [`/images/synthetic/${ministry.coverFile}`],
      visibility: "PUBLIC",
      publishStatus: "PUBLISHED",
      publishedAt: new Date("2026-11-01T12:00:00.000Z"),
      leaderPersonId: leader?.personId ?? null,
      leadershipPublic: leader
        ? [{ displayName: displayNameOf(leader.slug), roleTitle: "Coordenação" }]
        : [],
    },
  });
  return { id: ministry.createdId, created: true };
}

function displayNameOf(slug) {
  return buildCatalog().people.find((person) => person.slug === slug)?.displayName ?? slug;
}

async function reuseOrCreate(delegate, { id, where, create }) {
  const existing = await delegate.findUnique({ where, select: { id: true } });
  if (existing) return existing;
  return delegate.create({ data: create, select: { id: true } });
}

async function assertBalanced(tx) {
  const lines = await tx.ledgerEntryLine.findMany({
    where: { entryId: { startsWith: `${SEED_PREFIX}entry_` } },
    select: { entryId: true, side: true, amountCents: true },
  });
  const totals = new Map();
  for (const line of lines) {
    const current = totals.get(line.entryId) ?? { debit: 0, credit: 0 };
    if (line.side === "DEBIT") current.debit += line.amountCents;
    else current.credit += line.amountCents;
    totals.set(line.entryId, current);
  }
  for (const [entryId, total] of totals) {
    if (total.debit !== total.credit || total.debit <= 0) {
      throw new Error(`BLOQUEADO: lançamento ${entryId} ficou sem contra-partida`);
    }
  }
}

export async function rollback(tx) {
  const before = await inventory(tx);
  // audit_logs é append-only. O manifesto da massa fica; o rollback não apaga a trilha.
  await tx.groupMeetingAttendance.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.groupMeeting.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.smallGroupMember.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.smallGroup.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.budgetLine.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.budget.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.ledgerEntryLine.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.ledgerEntry.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.eventPaymentIntent.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.eventGuardianAuthorization.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.eventRegistration.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.eventLot.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.eventModality.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.portalEvent.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.rosterAssignment.deleteMany({
    where: { id: { startsWith: SEED_PREFIX }, substituteForId: { not: null } },
  });
  await tx.rosterAssignment.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.rosterSlot.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.roster.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.volunteerImpediment.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.volunteerAvailability.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.ministryMembership.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.memberCredential.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.admissionProtocol.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.churchMembership.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.user.deleteMany({ where: { id: { startsWith: `${SEED_PREFIX}user_` } } });
  await tx.ministry.updateMany({
    where: { id: { startsWith: `${SEED_PREFIX}ministry_` } },
    data: { leaderPersonId: null },
  });
  await tx.person.updateMany({
    where: { id: { startsWith: `${SEED_PREFIX}person_` } },
    data: { legalGuardianPersonId: null, householdId: null },
  });
  await tx.person.deleteMany({ where: { id: { startsWith: `${SEED_PREFIX}person_` } } });
  await tx.household.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.ledgerAccount.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.costCenter.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.fund.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  await tx.ministry.deleteMany({ where: { id: { startsWith: `${SEED_PREFIX}ministry_` } } });
  const after = await inventory(tx);
  return {
    before,
    after,
    removedSeedPersons: before.seedPersons - after.seedPersons,
    preservedPersons: after.preservedPersons,
    passwordsReset: false,
    paymentsSent: false,
    messagesSent: false,
  };
}

async function inventory(tx) {
  const [
    persons,
    preservedPersons,
    seedPersons,
    churchMemberships,
    ministryMemberships,
    rosters,
    rosterAssignments,
    portalEvents,
    eventRegistrations,
    ledgerEntries,
    ledgerEntryLines,
    memberCredentials,
    households,
  ] = await Promise.all([
    tx.person.count(),
    tx.person.count({ where: { NOT: { id: { startsWith: `${SEED_PREFIX}person_` } } } }),
    tx.person.count({ where: { id: { startsWith: `${SEED_PREFIX}person_` } } }),
    tx.churchMembership.count(),
    tx.ministryMembership.count(),
    tx.roster.count(),
    tx.rosterAssignment.count(),
    tx.portalEvent.count(),
    tx.eventRegistration.count(),
    tx.ledgerEntry.count(),
    tx.ledgerEntryLine.count(),
    tx.memberCredential.count(),
    tx.household.count(),
  ]);
  return {
    persons,
    preservedPersons,
    seedPersons,
    churchMemberships,
    ministryMemberships,
    rosters,
    rosterAssignments,
    portalEvents,
    eventRegistrations,
    ledgerEntries,
    ledgerEntryLines,
    memberCredentials,
    households,
  };
}

function delta(before, after) {
  const result = {};
  for (const key of Object.keys(after)) {
    result[key] = after[key] - before[key];
  }
  return result;
}

function summary(catalog) {
  return {
    persons: catalog.people.length,
    households: catalog.households.length,
    ministryLinks: catalog.memberships.length,
    rosters: catalog.rosters.length,
    events: catalog.events.length,
    ledgerEntries: catalog.ledgerEntries.length,
    credentials: catalog.credentials.length,
  };
}
