/**
 * Aplica a massa de QA só em registros qacomp_.
 * Não apaga histórico, não altera senha e não envia mensagem.
 */
import { createHash } from "node:crypto";
import { CHURCH_SLUG, ORG_SLUG, buildCatalog, summarize } from "./catalog.mjs";
import { assertLiveDatabaseName, assertQaApi, assertSeedTarget, QA_BRANCH, SeedGuardError } from "./guard.mjs";
import { portraitJpeg } from "./jpeg.mjs";

class DryRunComplete extends Error {
  constructor(report) {
    super("dry-run");
    this.name = "DryRunComplete";
    this.report = report;
  }
}

export async function runSeed({ mode, databaseUrl, env = process.env, fetchImpl, now = new Date() }) {
  const decision = assertSeedTarget({ databaseUrl, mode, env });
  const catalog = buildCatalog(now);
  if (decision.offline) {
    return {
      mode: mode === "report" ? "report" : "offline-plan",
      persisted: false,
      rolledBack: false,
      databaseName: null,
      place: "offline",
      banner: "QA — plano offline. Nenhum banco foi contactado.",
      planned: summarize(catalog),
    };
  }

  if (decision.place === "neon-qa") await assertQaApi(fetchImpl);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: ["error"] });
  try {
    const rows = await prisma.$queryRaw`SELECT current_database() AS name`;
    assertLiveDatabaseName(rows[0]?.name, decision.databaseName);
    if (decision.place === "neon-qa") {
      const branchRows = await prisma.$queryRaw`SELECT current_setting('neon.branch_id', true) AS branch_id`;
      const branchId = branchRows[0]?.branch_id;
      if (branchId && branchId !== QA_BRANCH) {
        throw new SeedGuardError("BLOQUEADO: neon.branch_id não é o ramo QA");
      }
    }
    try {
      const report = await prisma.$transaction(async (tx) => {
        const result = await applyQaMass(tx, catalog, { probe: true });
        if (mode !== "apply") throw new DryRunComplete(result);
        return result;
      }, { timeout: 120_000, maxWait: 15_000 });
      return { ...report, mode, persisted: true, rolledBack: false, databaseName: decision.databaseName, place: decision.place };
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

export async function applyQaMass(tx, catalog, options = {}) {
  const org = await tx.organization.findUnique({ where: { slug: ORG_SLUG } });
  const church = org ? await tx.church.findFirst({ where: { organizationId: org.id, slug: CHURCH_SLUG } }) : null;
  if (!org || !church) {
    throw new SeedGuardError("BLOQUEADO: a igreja piloto não existe. A massa não cria organização nem apaga dados.");
  }
  const scope = { organizationId: org.id, churchId: church.id };
  const people = new Map(catalog.people.map((person) => [person.slug, person]));

  for (const household of catalog.households) {
    await upsert(tx, "household", household.id, {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      label: household.label,
    });
  }

  for (const person of catalog.people) {
    await assertOwned(tx, "person", { organizationId: scope.organizationId, email: person.email }, person.id);
    await upsert(tx, "person", person.id, {
      organizationId: scope.organizationId,
      homeChurchId: scope.churchId,
      householdId: person.householdId,
      displayName: person.displayName,
      email: person.email,
      address: person.address,
      birthDate: new Date(`${person.birthDate}T12:00:00.000Z`),
      sex: person.sex === "F" ? "FEMALE" : "MALE",
      status: "ACTIVE",
      kind: person.kind,
      isMinor: person.isMinor,
      legalGuardianPersonId: person.legalGuardianPersonId ?? null,
      photoStorageKey: person.photoStorageKey,
    });
    const jpeg = portraitJpeg(person.portrait);
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff || jpeg.length > 192 * 1024) {
      throw new SeedGuardError("BLOQUEADO: retrato sintético não é um JPEG válido");
    }
    await tx.personPhoto.upsert({
      where: { personId: person.id },
      update: { jpeg },
      create: { personId: person.id, jpeg },
    });
  }

  for (const membership of catalog.churchMemberships) {
    await upsert(tx, "churchMembership", membership.id, {
      personId: membership.personId,
      churchId: scope.churchId,
      organizationId: scope.organizationId,
      status: membership.status,
      leftAt: null,
      joinedAt: new Date("2024-03-10T12:00:00.000Z"),
    });
  }

  for (const admission of catalog.admissions) {
    await upsert(tx, "admissionProtocol", admission.id, {
      personId: admission.personId,
      membershipId: admission.membershipId,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      status: admission.status,
      modality: admission.modality,
      currentStep: admission.currentStep,
      modalityRecorded: admission.modalityRecorded,
      documentsComplete: admission.documentsComplete,
      secretariaApproved: admission.secretariaApproved,
      pastorApproved: admission.pastorApproved,
      notes: "Protocolo sintético de demonstração.",
    });
  }

  for (const user of catalog.users) {
    await ensureRole(tx, user);
    await writeUser(tx, user);
    const role = await tx.role.findUnique({ where: { code: user.role } });
    const grant = await tx.grant.findFirst({
      where: {
        userId: user.id,
        roleId: role.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
      },
    });
    if (!grant) {
      await tx.grant.create({
        data: {
          id: `qacomp_grant_${user.role.toLowerCase()}`,
          userId: user.id,
          roleId: role.id,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
        },
      });
    }
  }

  const secretaria = catalog.users.find((user) => user.role === "SECRETARIA");
  const document = catalog.document;
  await tx.privateFile.upsert({
    where: { key: document.storageKey },
    update: { bytes: Buffer.from(document.text) },
    create: { key: document.storageKey, bytes: Buffer.from(document.text) },
  });
  await upsert(tx, "admissionDocument", document.id, {
    admissionId: document.admissionId,
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    uploadedByUserId: secretaria.id,
    displayName: document.displayName,
    contentType: "text/plain",
    byteSize: Buffer.byteLength(document.text),
    storageKey: document.storageKey,
  });

  for (const credential of catalog.credentials) {
    await upsert(tx, "memberCredential", credential.id, {
      membershipId: credential.membershipId,
      personId: credential.personId,
      churchId: scope.churchId,
      organizationId: scope.organizationId,
      status: credential.status,
      opaqueToken: credential.opaqueToken,
      revokedAt: credential.revoked ? new Date("2026-10-01T12:00:00.000Z") : null,
      issuedByUserId: secretaria.id,
      issuedAt: new Date("2026-03-10T12:00:00.000Z"),
    });
  }

  await assertOwned(tx, "ministry", { churchId: scope.churchId, slug: catalog.ministry.slug }, catalog.ministry.id);
  await upsert(tx, "ministry", catalog.ministry.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    name: catalog.ministry.name,
    slug: catalog.ministry.slug,
    description: catalog.ministry.description,
    coverImageUrl: catalog.ministry.coverImageUrl,
    scheduleText: "Domingo, antes do culto",
    visibility: "INTERNAL",
    publishStatus: "PUBLISHED",
    publishedAt: new Date("2026-11-01T12:00:00.000Z"),
    leaderPersonId: catalog.users.find((user) => user.role === "LIDER_MINISTERIO").personId,
  });

  for (const link of catalog.ministryLinks) {
    await upsert(tx, "ministryMembership", link.id, {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      ministryId: catalog.ministry.id,
      personId: link.personId,
      role: link.role,
      status: "ATIVO",
      source: "DIRETO",
      endedAt: null,
    });
  }

  for (const account of catalog.finance.accounts) {
    await assertOwned(tx, "ledgerAccount", { churchId: scope.churchId, code: account.code }, account.id);
    await upsert(tx, "ledgerAccount", account.id, {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      code: account.code,
      name: account.name,
      type: account.type,
      active: true,
    });
  }
  await assertOwned(tx, "churchReceivingAccount", { ledgerAccountId: catalog.finance.receiving.ledgerAccountId }, catalog.finance.receiving.id);
  await upsert(tx, "churchReceivingAccount", catalog.finance.receiving.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    ledgerAccountId: catalog.finance.receiving.ledgerAccountId,
    displayName: catalog.finance.receiving.displayName,
    pixKey: catalog.finance.receiving.pixKey,
    merchantCity: "Brasilia",
    active: true,
    mercadoPagoEnabled: false,
    mercadoPagoCollectorId: null,
  });

  const admin = catalog.users.find((user) => user.role === "PLATFORM_ADMIN");
  for (const event of catalog.events) {
    await assertOwned(tx, "portalEvent", { churchId: scope.churchId, slug: event.slug }, event.id);
    await upsert(tx, "portalEvent", event.id, {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      ministryId: catalog.ministry.id,
      name: event.name,
      slug: event.slug,
      description: event.description,
      imageUrl: event.imageUrl,
      startsAt: new Date(event.startsAt),
      endsAt: new Date(event.endsAt),
      locationText: event.locationText,
      status: event.status,
      featuredOnHome: event.featuredOnHome,
      ticketPolicy: event.ticketPolicy,
      createdByUserId: admin.id,
      publishedAt: event.status === "PUBLISHED" ? new Date(event.startsAt) : null,
      cancelledAt: event.status === "CANCELLED" ? new Date(event.startsAt) : null,
    });
    for (const modality of event.modalities) {
      await upsert(tx, "eventModality", modality.id, {
        eventId: event.id,
        code: modality.code,
        name: modality.name,
        kind: modality.kind,
        minPartySize: modality.min,
        maxPartySize: modality.max,
        sortOrder: 0,
      });
    }
    if (event.retreat) {
      await upsert(tx, "eventLodgingOption", `qacomp_lodge_${event.slug}`, {
        eventId: event.id, code: "familia", name: "Alojamento familiar fictício", kind: "FAMILY", sortOrder: 0,
      });
      await upsert(tx, "eventMealOption", `qacomp_meal_${event.slug}`, {
        eventId: event.id, code: "completa", name: "Alimentação demonstrativa", kind: "FULL_BOARD", sortOrder: 0,
      });
      await upsert(tx, "eventTransportOption", `qacomp_bus_${event.slug}`, {
        eventId: event.id, code: "onibus", name: "Ônibus demonstrativo", kind: "EVENT_BUS", sortOrder: 0,
      });
    }
    for (const lot of event.lots) {
      const modality = event.modalities.find((item) => item.code === lot.modalityCode);
      await upsert(tx, "eventLot", lot.id, {
        eventId: event.id,
        modalityId: modality.id,
        code: lot.code,
        name: lot.name,
        priceCents: lot.priceCents,
        currency: "BRL",
        opensAt: new Date(lot.opensAt),
        closesAt: new Date(lot.closesAt),
        status: lot.status,
        paymentProvider: lot.provider,
        receivingAccountId: lot.priceCents > 0 ? catalog.finance.receiving.id : null,
        sortOrder: lot.sortOrder,
      });
    }
    for (const registration of event.registrations) {
      const person = people.get(registration.personSlug);
      const lot = event.lots.find((item) => item.code === registration.lotCode);
      const modality = event.modalities.find((item) => item.code === registration.modalityCode);
      const guardian = person.legalGuardianPersonId
        ? catalog.people.find((item) => item.id === person.legalGuardianPersonId)
        : null;
      await upsert(tx, "eventRegistration", registration.id, {
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        registrantPersonId: person.id,
        eventId: event.id,
        modalityId: modality.id,
        lotId: lot.id,
        lodgingOptionId: event.retreat ? `qacomp_lodge_${event.slug}` : null,
        mealOptionId: event.retreat ? `qacomp_meal_${event.slug}` : null,
        transportOptionId: event.retreat ? `qacomp_bus_${event.slug}` : null,
        displayName: person.displayName,
        notificationEmail: person.email ?? guardian?.email ?? null,
        participantRoster: registration.tickets.length > 0 ? null : registration.partySize > 1
          ? Array.from({ length: registration.partySize }, (_, index) => ({ displayName: index === 0 ? person.displayName : `Acompanhante fictício ${index}` }))
          : null,
        partySize: registration.partySize,
        isMinor: person.isMinor,
        guardianDisplayName: registration.guardian ? guardian?.displayName ?? "Responsável fictício" : null,
        guardianAuthStatus: registration.guardian ?? "NOT_REQUIRED",
        guardianAuthorizedAt: registration.guardian === "AUTHORIZED" ? new Date("2026-11-01T12:00:00.000Z") : null,
        status: registration.status,
        paymentStatus: registration.paymentStatus,
        checkInCode: registration.checkInCode,
        checkedInAt: registration.status === "CHECKED_IN" ? new Date(event.startsAt) : null,
        cancelledAt: registration.status === "CANCELLED" ? new Date(event.startsAt) : null,
      });
      for (const ticket of registration.tickets) {
        await upsert(tx, "eventParticipantTicket", `qacomp_ticket_${event.slug}_${registration.id}_${ticket.position}`, {
          registrationId: registration.id,
          position: ticket.position,
          code: ticket.code,
          participantName: ticket.position === 1 ? person.displayName : `Acompanhante fictício ${ticket.position - 1}`,
          participantEmail: ticket.position === 1
            ? (person.email ?? guardian?.email ?? null)
            : `qacomp-acompanhante-${ticket.position}@example.test`,
          checkedInAt: ticket.checkedIn ? new Date(event.startsAt) : null,
        });
      }
      if (registration.guardian) {
        await upsert(tx, "eventGuardianAuthorization", `qacomp_guard_${registration.id}`, {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          registrationId: registration.id,
          guardianDisplayName: guardian?.displayName ?? "Responsável fictício",
          status: registration.guardian,
          acknowledgmentText: "Autorização sintética de demonstração.",
          authorizedAt: registration.guardian === "AUTHORIZED" ? new Date("2026-11-01T12:00:00.000Z") : null,
        });
      }
      if (registration.payment) {
        await upsert(tx, "eventPaymentIntent", registration.payment.id, {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          eventId: event.id,
          registrationId: registration.id,
          lotId: lot.id,
          amountCents: lot.priceCents,
          currency: "BRL",
          status: registration.payment.status,
          providerRef: registration.payment.providerRef,
          paymentProvider: lot.provider,
          attemptRef: registration.payment.providerRef,
          grossCents: lot.priceCents,
          feeCents: 0,
          netCents: lot.priceCents,
          dueOn: new Date(`${catalog.today}T12:00:00.000Z`),
          receivingAccountId: lot.priceCents > 0 ? catalog.finance.receiving.id : null,
          pixCopiaECola: lot.provider === "PIX" && registration.payment.status === "PENDING" ? "MOCK-QA-NAO-PAGAR" : null,
          confirmedAt: registration.payment.status.startsWith("CONFIRMED") ? new Date("2026-11-01T12:00:00.000Z") : null,
        });
        if (registration.payment.status === "CONFIRMED_GATEWAY") {
          await upsert(tx, "eventPaymentWebhookReceipt", `qacomp_hook_${registration.payment.id}`, {
            organizationId: scope.organizationId,
            churchId: scope.churchId,
            paymentIntentId: registration.payment.id,
            idempotencyKey: `qacomp-webhook-${registration.payment.id}`,
            eventType: "payment.updated",
            payloadHash: createHash("sha256").update(registration.payment.providerRef).digest("hex"),
            resultStatus: "CONFIRMED_MOCK",
          });
        }
      }
    }
  }

  for (const module of catalog.roster.modules) {
    await upsert(tx, "ministryRosterModule", module.id, {
      ministryId: catalog.ministry.id,
      name: module.name,
      nameKey: `qacomp-${module.key}`,
      rules: {},
      locationName: module.sector,
    });
  }
  const helenaLink = catalog.ministryLinks.find((link) => link.role === "LIDER");
  const recepcao = catalog.roster.modules[0];
  const moduleLink = await tx.ministryRosterModuleMembership.findFirst({
    where: { membershipId: helenaLink.id, moduleId: recepcao.id },
  });
  if (!moduleLink) {
    await tx.ministryRosterModuleMembership.create({
      data: {
        id: "qacomp_module_member_helena",
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        ministryId: catalog.ministry.id,
        membershipId: helenaLink.id,
        moduleId: recepcao.id,
        personId: helenaLink.personId,
        status: "ATIVO",
      },
    });
  }
  await upsert(tx, "roster", catalog.roster.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    ministryId: catalog.ministry.id,
    moduleId: recepcao.id,
    title: catalog.roster.title,
    serviceAt: new Date(catalog.roster.serviceAt),
    locationName: "Templo — Riacho Fundo I",
    status: "PUBLISHED",
    serviceType: "CULTO",
  });
  for (const [index, slot] of catalog.roster.slots.entries()) {
    const module = catalog.roster.modules.find((item) => item.key === slot.moduleKey);
    const slotId = `qacomp_slot_${slot.moduleKey}`;
    await upsert(tx, "rosterSlot", slotId, {
      rosterId: catalog.roster.id,
      roleLabel: slot.roleLabel,
      requiresCouple: Boolean(slot.partnerSlug),
      sector: module.sector,
      zone: module.zone,
      side: module.side,
      sortOrder: index,
    });
    const assignmentId = `qacomp_asg_${slot.moduleKey}`;
    await upsert(tx, "rosterAssignment", assignmentId, {
      slotId,
      personId: people.get(slot.personSlug).id,
      partnerPersonId: slot.partnerSlug ? people.get(slot.partnerSlug).id : null,
      status: slot.status,
      confirmedAt: slot.status === "CONFIRMED" ? new Date(catalog.roster.serviceAt) : null,
      declinedAt: slot.status === "DECLINED" ? new Date(catalog.roster.serviceAt) : null,
    });
    if (slot.substituteSlug) {
      await upsert(tx, "rosterAssignment", `${assignmentId}_sub`, {
        slotId,
        personId: people.get(slot.substituteSlug).id,
        status: "CONFIRMED",
        substituteForId: assignmentId,
        confirmedAt: new Date(catalog.roster.serviceAt),
      });
    }
  }

  await upsert(tx, "volunteerAvailability", catalog.availability.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    personId: catalog.availability.personId,
    weekday: catalog.availability.weekday,
    startMinute: catalog.availability.startMinute,
    endMinute: catalog.availability.endMinute,
    notes: "Disponibilidade semanal demonstrativa",
    active: true,
  });
  await upsert(tx, "volunteerImpediment", catalog.impediment.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    personId: catalog.impediment.personId,
    startsAt: new Date(catalog.impediment.startsAt),
    endsAt: new Date(catalog.impediment.endsAt),
    reason: "Bloqueio demonstrativo da semana",
  });
  await upsert(tx, "volunteerServingPreference", catalog.preference.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    personId: catalog.preference.personId,
    onlyEvening: true,
  });
  await tx.personVocalProfile.upsert({
    where: { personId: catalog.vocal.personId },
    update: { churchId: scope.churchId, classification: catalog.vocal.classification, functions: ["vocal"] },
    create: { personId: catalog.vocal.personId, churchId: scope.churchId, classification: catalog.vocal.classification, functions: ["vocal"] },
  });
  const lider = catalog.users.find((user) => user.role === "LIDER_MINISTERIO");
  await assertOwned(tx, "worshipRepertoire", { idempotencyKey: catalog.repertoire.idempotencyKey }, catalog.repertoire.id);
  await upsert(tx, "worshipRepertoire", catalog.repertoire.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    rosterId: catalog.roster.id,
    serviceAt: new Date(catalog.repertoire.serviceAt),
    status: "SCHEDULED",
    idempotencyKey: catalog.repertoire.idempotencyKey,
    createdByUserId: lider.id,
    scheduledAt: new Date(catalog.repertoire.serviceAt),
  });
  for (const [songId, sortOrder, title, musicalKey] of catalog.repertoire.items) {
    await upsert(tx, "worshipRepertoireItem", songId, {
      repertoireId: catalog.repertoire.id, sortOrder, title, musicalKey,
    });
  }
  const notice = await tx.worshipRepertoireNotice.findFirst({
    where: { repertoireId: catalog.repertoire.id, recipientPersonId: catalog.repertoire.noticePersonId },
  });
  if (!notice) {
    await tx.worshipRepertoireNotice.create({
      data: { id: "qacomp_repertoire_notice", repertoireId: catalog.repertoire.id, recipientPersonId: catalog.repertoire.noticePersonId },
    });
  }

  const tesouraria = catalog.users.find((user) => user.role === "TESOURARIA");
  const pastor = catalog.users.find((user) => user.role === "PASTOR");
  await writeEntry(tx, catalog.finance.expense, scope, tesouraria.id, null, null);
  await writeEntry(tx, catalog.finance.offering, scope, tesouraria.id, tesouraria.id, pastor.id);
  for (const batch of catalog.finance.imports) {
    await assertOwned(tx, "bankImportBatch", {
      churchId: scope.churchId,
      accountId: catalog.finance.receiving.ledgerAccountId,
      fileHash: batch.fileHash,
    }, batch.id);
    await upsert(tx, "bankImportBatch", batch.id, {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      format: "OFX",
      status: "PARSED",
      adapter: batch.adapter,
      accountId: catalog.finance.receiving.ledgerAccountId,
      fileHash: batch.fileHash,
      filename: batch.filename,
      stubNote: "Extrato fictício. Sem API bancária.",
      lineCount: 1,
      createdByUserId: tesouraria.id,
    });
    await upsert(tx, "bankStatementLine", batch.lineId, {
      batchId: batch.id,
      postedAt: new Date(batch.postedAt),
      amountCents: batch.amountCents,
      description: batch.description,
      externalRef: `mock-${batch.adapter.toLowerCase()}`,
      matchStatus: batch.matchStatus,
      matchedEntryId: batch.matchedEntryId,
    });
  }
  await upsert(tx, "reconciliation", catalog.finance.reconciliation.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    title: catalog.finance.reconciliation.title,
    periodStart: new Date(`${catalog.finance.reconciliation.periodStart}T12:00:00.000Z`),
    periodEnd: new Date(`${catalog.finance.reconciliation.periodEnd}T12:00:00.000Z`),
    status: catalog.finance.reconciliation.status,
    notes: "Conciliação idempotente de demonstração.",
    createdByUserId: tesouraria.id,
  });

  await upsert(tx, "smallGroup", catalog.group.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    name: catalog.group.name,
    leaderPersonId: catalog.group.leaderPersonId,
    meetsAtHint: "Quinta, de noite",
    meetingAddress: catalog.group.meetingAddress,
    photoUrl: catalog.group.photoUrl,
    publicListed: false,
  });
  await upsert(tx, "smallGroupMember", "qacomp_group_leader", {
    groupId: catalog.group.id, personId: catalog.group.leaderPersonId, role: "LEADER",
  });
  await upsert(tx, "smallGroupMember", "qacomp_group_member", {
    groupId: catalog.group.id, personId: catalog.group.memberPersonId, role: "MEMBER",
  });

  await upsert(tx, "discipleshipTrack", catalog.track.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    code: catalog.track.code,
    name: catalog.track.name,
    description: "Trilha sintética. A criança exclusiva não tem vínculo de membresia.",
  });
  await upsert(tx, "discipleshipTrackStage", catalog.track.stageId, {
    trackId: catalog.track.id, sortOrder: 1, code: "inicio", title: "Início demonstrativo",
  });
  const mentor = await tx.discipleshipMentorRegistration.findFirst({
    where: { trackId: catalog.track.id, personId: catalog.track.mentorPersonId },
  });
  if (!mentor) {
    await tx.discipleshipMentorRegistration.create({
      data: { trackId: catalog.track.id, personId: catalog.track.mentorPersonId },
    });
  }
  for (const [enrollmentId, personId] of [
    ["qacomp_enroll_yara", catalog.track.exclusivePersonId],
    ["qacomp_enroll_sofia", catalog.track.memberPersonId],
  ]) {
    await upsert(tx, "discipleshipEnrollment", enrollmentId, {
      trackId: catalog.track.id,
      personId,
      mentorPersonId: catalog.track.mentorPersonId,
      status: "ACTIVE",
    });
  }

  const editor = catalog.users.find((user) => user.role === "EDITOR_SITE");
  await assertOwned(tx, "cmsContent", { churchId: scope.churchId, slug: catalog.cms.slug }, catalog.cms.id);
  await upsert(tx, "cmsContent", catalog.cms.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    kind: "BANNER",
    slug: catalog.cms.slug,
    title: catalog.cms.title,
    summary: "Rascunho sintético para o editor. Não está publicado.",
    imageUrl: catalog.cms.imageUrl,
    status: catalog.cms.status,
    createdByUserId: editor.id,
    updatedByUserId: editor.id,
  });
  await upsert(tx, "volunteerInterest", catalog.interest.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    ministryId: catalog.ministry.id,
    displayName: catalog.interest.displayName,
    email: catalog.interest.email,
    personId: catalog.interest.personId,
    stage: "INTERESSE",
    status: "OPEN",
    message: "Quero conhecer a recepção. Cadastro sintético.",
  });
  for (const birthday of catalog.birthdays) {
    await upsert(tx, "birthdayNotice", birthday.id, {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      recipientPersonId: birthday.personId,
      occasionDate: new Date(`${birthday.occasionDate}T12:00:00.000Z`),
    });
  }

  const owned = options.probe && tx.$queryRaw ? await ownedCounts(tx) : null;
  return {
    banner: "QA — somente registros qacomp_. Senhas existentes não foram alteradas.",
    planned: summarize(catalog),
    owned,
  };
}

async function writeEntry(tx, entry, scope, createdByUserId, firstApprover, secondApprover) {
  await upsert(tx, "ledgerEntry", entry.id, {
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    entryDate: new Date(`${entry.entryDate}T12:00:00.000Z`),
    description: entry.description,
    status: entry.status,
    amountCents: entry.amountCents,
    createdByUserId,
    submittedAt: new Date(`${entry.entryDate}T12:00:00.000Z`),
    firstApprovedByUserId: firstApprover,
    firstApprovedAt: firstApprover ? new Date(`${entry.entryDate}T12:00:00.000Z`) : null,
    secondApprovedByUserId: secondApprover,
    secondApprovedAt: secondApprover ? new Date(`${entry.entryDate}T12:00:00.000Z`) : null,
    competenceYear: Number(entry.entryDate.slice(0, 4)),
    competenceMonth: Number(entry.entryDate.slice(5, 7)),
  });
  for (const [lineId, accountId, side, amountCents] of entry.lines) {
    await upsert(tx, "ledgerEntryLine", lineId, { entryId: entry.id, accountId, side, amountCents });
  }
}

async function ensureRole(tx, user) {
  const existing = await tx.role.findUnique({ where: { code: user.role } });
  if (existing) return;
  await tx.role.create({
    data: {
      id: `qacomp_role_${user.role.toLowerCase()}`,
      code: user.role,
      name: user.roleName,
      description: "Papel usado pelas contas sintéticas de QA.",
    },
  });
}

async function writeUser(tx, user) {
  const byId = await tx.user.findUnique({ where: { id: user.id } });
  const byEmail = await tx.user.findUnique({ where: { email: user.email } });
  if (byEmail && byEmail.id !== user.id) {
    throw new SeedGuardError("BLOQUEADO: e-mail de QA já pertence a outra conta. Senha não alterada.");
  }
  if (byId) {
    await tx.user.update({
      where: { id: user.id },
      data: { email: user.email, personId: user.personId, status: "ACTIVE" },
    });
    return;
  }
  await tx.user.create({
    data: { id: user.id, email: user.email, personId: user.personId, status: "ACTIVE", passwordHash: null },
  });
}

async function assertOwned(tx, model, where, expectedId) {
  if (Object.values(where).some((value) => value == null)) return;
  const found = await tx[model].findFirst({ where });
  if (found && found.id !== expectedId) {
    throw new SeedGuardError(`BLOQUEADO: chave estável de ${model} já pertence a outro registro. Nada foi reaproveitado.`);
  }
}

async function upsert(tx, model, id, data, options = {}) {
  const where = options.where ?? { id };
  const delegate = tx[model];
  await delegate.upsert({
    where,
    update: data,
    create: options.idField ? data : { id, ...data },
  });
}

async function ownedCounts(tx) {
  const rows = await tx.$queryRaw`
    SELECT
      (SELECT count(*)::int FROM persons WHERE id LIKE 'qacomp_person_%') AS people,
      (SELECT count(*)::int FROM person_photos WHERE person_id LIKE 'qacomp_person_%') AS photos,
      (SELECT count(*)::int FROM portal_events WHERE id LIKE 'qacomp_event_%') AS events
  `;
  return rows[0];
}
