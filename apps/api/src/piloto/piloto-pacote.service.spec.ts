import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { publicPasswordResetBody } from "@idbrf/shared";
import { signMercadoPagoManifest, mercadoPagoManifest } from "./mercado-pago-signature";
import { AccessInvitationService } from "../auth/access-invitation.service";
import type { AuthUser } from "../auth/types/auth-user";
import { EventRegistrationsService } from "../events/event-registrations.service";
import { mockBankProbe } from "../finance/bank-adapters";
import { assertOperationalScope } from "./church";
import { BirthdayNoticesService } from "./birthday-notices.service";
import { MercadoPagoService, type GatewayPayment } from "./mercado-pago.service";
import { ParticipantScanService } from "./participant-scan.service";
import { PastoralPackService } from "./pastoral-pack.service";
import { SystemSettingsService } from "./system-settings.service";

const pilot = { organizationId: "org", churchId: "riacho", organizationSlug: "igreja", churchSlug: "riacho", churchName: "Riacho" };
const admin: AuthUser = { userId: "admin", personId: "p-admin", email: "admin@example.test", grants: [{ roleCode: "PLATFORM_ADMIN", organizationId: "org", churchId: "riacho" }] };
const pastor: AuthUser = { userId: "pastor", personId: "p-pastor", email: "pastor@example.test", grants: [{ roleCode: "PASTOR", organizationId: "org", churchId: "riacho" }] };
const otherPastor: AuthUser = { userId: "outro", personId: "p-outro", email: "outro@example.test", grants: [{ roleCode: "PASTOR", organizationId: "org", churchId: "riacho" }] };
const secretaria: AuthUser = { userId: "sec", personId: "p-sec", email: "sec@example.test", grants: [{ roleCode: "SECRETARIA", organizationId: "org", churchId: "riacho" }] };

describe("recuperação de senha neutra", () => {
  it("não revela se a conta existe e só envia para a conta ativa", async () => {
    const sent: string[] = [];
    const invites: Array<Record<string, unknown>> = [];
    const prisma = {
      user: { findFirst: async ({ where }: { where: { email: { equals: string } } }) => where.email.equals === "ana@example.test"
        ? { id: "u", email: "ana@example.test", status: "ACTIVE", passwordHash: "hash", person: { displayName: "Ana" } }
        : null },
      accessInvitation: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "inv", ...data }; invites.push(row); return row; },
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
      },
      auditLog: { create: async () => ({}) },
    };
    const previous = process.env.EMAIL_TRANSPORT;
    process.env.EMAIL_TRANSPORT = "test";
    process.env.ACCESS_INVITE_WEB_ORIGIN = "https://dev.example.test";
    const service = new AccessInvitationService(prisma as never, { deliverOnce: async (message: { to: string }) => { sent.push(message.to); return { status: "SENT", idempotentReplay: false, providerMessageId: "t" }; } } as never);
    await service.requestPublicReset("ana@example.test");
    await service.requestPublicReset("ninguem@example.test");
    process.env.EMAIL_TRANSPORT = previous;
    expect(sent).toEqual(["ana@example.test"]);
    expect(invites).toHaveLength(1);
    expect(publicPasswordResetBody()).toEqual(publicPasswordResetBody());
    const expiresAt = invites[0].expiresAt as Date;
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(50 * 60_000);
    expect(expiresAt.getTime() - Date.now()).toBeLessThan(70 * 60_000);
  });

  it("usa a vigência publicada da recuperação, limitada a 24 horas", async () => {
    const invites: Array<Record<string, unknown>> = [];
    const prisma = {
      user: { findFirst: async () => ({ id: "u", email: "ana@example.test", status: "ACTIVE", passwordHash: "hash", person: { displayName: "Ana" } }) },
      accessInvitation: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "inv", ...data }; invites.push(row); return row; },
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
      },
      auditLog: { create: async () => ({}) },
      systemSettingCatalog: { findUnique: async () => ({ key: "auth.password_reset.ttl_hours", devJson: 1 }) },
      systemSettingRevision: { findMany: async () => [{ id: "rev", valueJson: 6, effectiveFrom: new Date("2026-11-01T00:00:00.000Z"), effectiveUntil: null }] },
    };
    process.env.EMAIL_TRANSPORT = "test";
    process.env.ACCESS_INVITE_WEB_ORIGIN = "https://dev.example.test";
    const service = new AccessInvitationService(prisma as never, { deliverOnce: async () => ({ status: "SENT", idempotentReplay: false, providerMessageId: "t" }) } as never);
    await service.requestPublicReset("ana@example.test");
    const expiresAt = invites[0].expiresAt as Date;
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(5 * 3600_000);
    expect(expiresAt.getTime() - Date.now()).toBeLessThan(7 * 3600_000);
  });
});

describe("inscrição exige sessão", () => {
  it("recusa quem não tem papel de membro ou convidado", async () => {
    const service = new EventRegistrationsService({} as never, { getPilotChurch: async () => pilot } as never);
    await expect(service.createMemberRegistration({ userId: "x", personId: "p", email: "x@example.test", grants: [] }, "culto", { displayName: "Ana", modalityId: "m", lotId: "l" })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("gestão do sistema preserva o DEV", () => {
  it("publica a vigência sem alterar o valor de DEV e recusa sobreposição", async () => {
    const catalog = { key: "notices.birthday.hour_brasilia", title: "Hora", description: "DEV", valueType: "time", scopeKind: "CHURCH", defaultJson: "08:00", devJson: "08:00" };
    const revisions: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];
    const prisma = {
      systemSettingCatalog: {
        findMany: async () => [catalog],
        findUnique: async () => catalog,
      },
      systemSettingRevision: {
        findMany: async ({ where }: { where: { lifecycle?: string } }) => revisions.filter(item => !where.lifecycle || item.lifecycle === where.lifecycle),
        findFirst: async ({ where }: { where: { id: string } }) => revisions.find(item => item.id === where.id) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "rev-1", createdAt: new Date("2026-11-20T12:00:00.000Z"), updatedAt: new Date("2026-11-20T12:00:00.000Z"), effectiveFrom: null, effectiveUntil: null, scopeId: null, ...data };
          revisions.push(row);
          return row;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(revisions[0], data, { updatedAt: new Date("2026-11-20T12:05:00.000Z") });
          return revisions[0];
        },
      },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const service = new SystemSettingsService(prisma as never, { getPilotChurch: async () => pilot } as never);
    const draft = await service.draft(admin, { key: catalog.key, value: "09:00" });
    await service.review(admin, draft.id, draft.updatedAt);
    const published = await service.publish(admin, draft.id, { effectiveFrom: "2026-11-21T00:00:00.000Z", expectedUpdatedAt: "2026-11-20T12:05:00.000Z" });
    expect(published.lifecycle).toBe("PUBLISHED");
    expect(catalog.devJson).toBe("08:00");
    expect(JSON.stringify(audits)).not.toContain("09:00");
    revisions.push({ ...revisions[0], id: "rev-2", lifecycle: "IN_REVIEW", effectiveFrom: null });
    prisma.systemSettingRevision.findFirst = async () => revisions[1];
    await expect(service.publish(admin, "rev-2", { effectiveFrom: "2026-11-22T00:00:00.000Z" })).rejects.toBeInstanceOf(ConflictException);
    const before = await service.effective(admin, catalog.key, "CHURCH", undefined, new Date("2026-11-20T12:00:00.000Z"));
    expect(before).toMatchObject({ source: "DEV", value: "08:00" });
  });

  it("distingue regra ativa, bloqueio e regra que ainda não altera o sistema", async () => {
    const rows = [
      { key: "auth.password_reset.ttl_hours", title: "Validade", description: "Horas", valueType: "number", scopeKind: "CHURCH", defaultJson: 1, devJson: 1 },
      { key: "events.registration.session_required", title: "Sessão", description: "Obrigatória", valueType: "boolean", scopeKind: "CHURCH", defaultJson: true, devJson: true },
      { key: "rosters.louvor.week_block", title: "Louvor", description: "Semana", valueType: "boolean", scopeKind: "MINISTRY", defaultJson: true, devJson: true },
    ];
    const prisma = {
      systemSettingCatalog: { findMany: async () => rows, findUnique: async ({ where }: { where: { key: string } }) => rows.find(row => row.key === where.key) ?? null },
      systemSettingRevision: { create: async () => ({}) },
      auditLog: { create: async () => ({}) },
    };
    const service = new SystemSettingsService(prisma as never, { getPilotChurch: async () => pilot } as never);
    const catalog = await service.catalog(admin);
    expect(catalog.items.map((item: { key: string; behavior: string; editable: boolean }) => [item.key, item.behavior, item.editable])).toEqual([
      ["auth.password_reset.ttl_hours", "active", true],
      ["events.registration.session_required", "locked", false],
      ["rosters.louvor.week_block", "documentary", false],
    ]);
    await expect(service.draft(admin, { key: "events.registration.session_required", value: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.draft(admin, { key: "rosters.louvor.week_block", value: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.draft(admin, { key: "auth.password_reset.ttl_hours", value: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.draft(admin, { key: "auth.password_reset.ttl_hours", value: 48 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("oração e sino", () => {
  it("entrega o texto só ao pastor responsável e o sino sem o pedido", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const bells: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];
    const prisma = {
      user: { findFirst: async () => ({ id: "pastor" }), findMany: async () => [{ id: "pastor" }, { id: "outro" }] },
      prayerRequest: {
        create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "ora", createdAt: new Date(), ...data }; requests.push(row); return row; },
        findMany: async () => requests,
        findFirst: async ({ where }: { where: { id: string } }) => requests.find(item => item.id === where.id) ?? null,
        count: async () => requests.filter(item => item.status === "OPEN").length,
      },
      prayerBell: {
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { bells.push(...data.map(item => ({ id: `b-${bells.length}`, createdAt: new Date(), readAt: null, ...item }))); return { count: data.length }; },
        findMany: async ({ where }: { where: { recipientUserId: string } }) => bells.filter(item => item.recipientUserId === where.recipientUserId),
        findFirst: async ({ where }: { where: { id: string; recipientUserId: string } }) =>
          bells.find(item => item.id === where.id && item.recipientUserId === where.recipientUserId) ?? null,
        updateMany: async () => ({ count: 1 }),
      },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const service = new PastoralPackService(prisma as never, { getPilotChurch: async () => pilot } as never, { put: async () => undefined } as never);
    const created = await service.createPrayer(secretaria, { body: "Pedido fictício pela família Exemplo", responsibleUserId: "pastor" });
    expect(created).toEqual({ id: "ora", status: "OPEN", notified: 2 });
    expect(JSON.stringify(created)).not.toContain("Exemplo");
    expect(JSON.stringify(audits)).not.toContain("Exemplo");
    const list = await service.listPrayers(secretaria);
    expect(JSON.stringify(list)).not.toContain("Exemplo");
    expect(list.requests[0].canReadText).toBe(false);
    await expect(service.readPrayer(secretaria, "ora")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.readPrayer(pastor, "ora")).resolves.toMatchObject({ body: "Pedido fictício pela família Exemplo" });
    const notice = await service.bells(otherPastor);
    expect(notice.notices[0].title).toBe("Há um pedido de oração");
    expect(JSON.stringify(notice)).not.toContain("Exemplo");
    const marked = await service.readBell(otherPastor, String(notice.notices[0].id));
    expect(marked).toEqual({ id: notice.notices[0].id, read: true });
    await expect(service.readBell(pastor, "aviso-de-outra-pessoa")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("aniversário em Brasília", () => {
  it("espera o horário e grava um aviso por destinatário no dia", async () => {
    const notices: Array<{ recipientPersonId: string }> = [];
    const people = [{
      id: "ana", displayName: "Ana", birthDate: new Date("1990-11-20T00:00:00.000Z"),
      discipleshipEnrollments: [{ status: "ACTIVE", trackId: "trilha", mentorPersonId: "mentor", track: { churchId: "riacho" } }],
    }];
    const prisma = {
      person: { findMany: async () => people },
      accessScopeBinding: { findMany: async () => [] },
      user: { findMany: async () => [{ personId: "pastor" }, { personId: "secretario" }] },
      ministryMembership: { findMany: async () => [{ ministry: { leaderPersonId: "lider", ministryMemberships: [] } }] },
      smallGroupMember: { findMany: async () => [{ group: { leaderPersonId: "lider-grupo", members: [] } }] },
      birthdayNotice: {
        findMany: async () => notices,
        createMany: async ({ data }: { data: Array<{ recipientPersonId: string }> }) => { notices.push(...data); return { count: data.length }; },
      },
      systemSettingCatalog: { findUnique: async () => ({ key: "notices.birthday.hour_brasilia", scopeKind: "CHURCH", valueType: "time", devJson: "08:00" }) },
      systemSettingRevision: { findMany: async () => [] },
    };
    const settings = new SystemSettingsService(prisma as never, { getPilotChurch: async () => pilot } as never);
    const service = new BirthdayNoticesService(prisma as never, { getPilotChurch: async () => pilot } as never, settings);
    const early = await service.run(secretaria, new Date("2026-11-20T10:30:00.000Z"));
    expect(early).toMatchObject({ skipped: true, reason: "BEFORE_CONFIGURED_HOUR", created: 0 });
    const first = await service.run(secretaria, new Date("2026-11-20T12:00:00.000Z"));
    expect(first).toMatchObject({ skipped: false, created: 5, title: "Há aniversariantes hoje na congregação." });
    const second = await service.run(secretaria, new Date("2026-11-20T15:00:00.000Z"));
    expect(second).toMatchObject({ created: 0 });
    expect(notices.map(item => item.recipientPersonId).sort()).toEqual(["lider", "lider-grupo", "mentor", "pastor", "secretario"]);
  });
});

describe("Mercado Pago e leitura do ingresso", () => {
  it("consulta o pagamento antes de confirmar, não duplica o lançamento e estorna uma vez", async () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = "segredo-de-teste";
    const intents: Array<{
      id: string; organizationId: string; churchId: string; registrationId: string; eventId: string;
      attemptRef: string; status: string; ledgerEntryId: string | null; refundedAt: Date | null;
      amountCents: number; currency: string; paymentProvider: string; receivingAccountId: string;
      registration: { id: string; registrantPersonId: string; status: string; paymentStatus: string };
      event: { id: string; status: string; name: string };
    }> = [{
      id: "pay", organizationId: "org", churchId: "riacho", registrationId: "reg", eventId: "evt",
      attemptRef: "mp_1", status: "PENDING", ledgerEntryId: null, refundedAt: null, amountCents: 10000,
      currency: "BRL", paymentProvider: "MERCADO_PAGO", receivingAccountId: "conta",
      registration: { id: "reg", registrantPersonId: "ana", status: "PENDING_PAYMENT", paymentStatus: "PENDING" },
      event: { id: "evt", status: "PUBLISHED", name: "Encontro" },
    }];
    const entries: Array<Record<string, unknown>> = [];
    const receipts: Array<Record<string, unknown>> = [];
    let queries = 0;
    const gateway = {
      createPreference: async () => ({ preferenceId: "pref", initPoint: "https://mock.mercadopago.test/checkout?ref=mp_1", mode: "mock" as const }),
      getPayment: async (id: string): Promise<GatewayPayment> => {
        queries += 1;
        return { id, status: "approved", currency: "BRL", externalReference: "mp_1", grossCents: 10000, feeCents: 390 };
      },
    };
    const prisma = {
      eventPaymentWebhookReceipt: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) => receipts.find(item => item.idempotencyKey === where.idempotencyKey) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => { receipts.push(data); return data; },
      },
      eventPaymentIntent: {
        findFirst: async () => intents[0],
        update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(intents[0], data),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          if (data.status === "CONFIRMED_GATEWAY" && intents[0].ledgerEntryId) return { count: 0 };
          if (data.status === "CONFIRMED_GATEWAY") Object.assign(intents[0], data);
          if (data.status === "REFUNDED") {
            if (intents[0].refundedAt) return { count: 0 };
            Object.assign(intents[0], data);
          }
          return { count: 1 };
        },
      },
      user: { findFirst: async () => ({ id: "tesoureiro" }) },
      churchReceivingAccount: { findFirst: async () => ({ ledgerAccountId: "banco" }) },
      ledgerAccount: { findFirst: async ({ where }: { where: { type: string } }) => ({ id: where.type === "EXPENSE" ? "taxa" : "receita" }) },
      ledgerEntry: { create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `led-${entries.length + 1}`, ...data }; entries.push(row); intents[0].ledgerEntryId = String(row.id); return row; } },
      eventRegistration: { updateMany: async () => ({ count: 1 }) },
      eventParticipantTicket: { findMany: async () => [] },
      portalEvent: { findUnique: async () => ({ name: "Encontro" }) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const service = new MercadoPagoService(prisma as never, { getPilotChurch: async () => pilot } as never);
    service.gateway = gateway;
    const timestamp = "1700000000";
    const signature = `ts=${timestamp},v1=${signMercadoPagoManifest("segredo-de-teste", mercadoPagoManifest({ dataId: "pay-1", requestId: "req-1", ts: timestamp }))}`;
    const call = (header: string, dataId = "pay-1") => service.handleWebhook({ signatureHeader: header, requestId: "req-1", dataId });
    await expect(call(`ts=${timestamp},v1=${"0".repeat(64)}`)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queries).toBe(0);
    const first = await call(signature);
    const replay = await call(signature);
    expect(first).toMatchObject({ replay: false, resultStatus: "CONFIRMED" });
    expect(replay).toMatchObject({ replay: true, resultStatus: "CONFIRMED" });
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toContain("bruto 10000");
    expect(entries[0].description).toContain("taxa 390");
    expect(entries[0].description).toContain("líquido 9610");
    const refundSignature = `ts=${timestamp},v1=${signMercadoPagoManifest("segredo-de-teste", mercadoPagoManifest({ dataId: "pay-1-refund", requestId: "req-1", ts: timestamp }))}`;
    gateway.getPayment = async () => ({ id: "pay-1-refund", status: "refunded", currency: "BRL", externalReference: "mp_1", grossCents: 10000, feeCents: 390 });
    intents[0].registration.status = "CONFIRMED";
    intents[0].registration.paymentStatus = "CONFIRMED_GATEWAY";
    await call(refundSignature, "pay-1-refund");
    await call(refundSignature, "pay-1-refund");
    expect(entries.filter(item => item.reversalOfEntryId)).toHaveLength(1);
  });

  it("não lê QR de outro evento e não lança presença duas vezes", async () => {
    const ticket = {
      id: "t", code: "a".repeat(16), registrationId: "reg", checkedInAt: null as Date | null, scannedByUserId: null as string | null,
      registration: { id: "reg", eventId: "mocas", status: "CONFIRMED", paymentStatus: "CONFIRMED_GATEWAY", churchId: "riacho" },
    };
    const audits: Array<Record<string, unknown>> = [];
    const event = { id: "mocas", ministryId: "mulheres", createdByUserId: "criador", startsAt: new Date("2026-11-20T15:00:00.000Z"), endsAt: null, ministry: { leaderPersonId: "lider" }, organizationId: "org", churchId: "riacho" };
    const prisma = {
      portalEvent: { findFirst: async ({ where }: { where: { id: string } }) => where.id === "mocas" ? event : where.id === "outro" ? { ...event, id: "outro" } : null },
      eventParticipantTicket: {
        findFirst: async () => ticket,
        updateMany: async () => ticket.checkedInAt ? { count: 0 } : (ticket.checkedInAt = new Date("2026-11-20T18:00:00.000Z"), ticket.scannedByUserId = "lider", { count: 1 }),
        findUnique: async () => ticket,
        count: async () => 0,
      },
      eventRegistration: { updateMany: async () => ({ count: 1 }) },
      eventScannerGrant: { findFirst: async () => null },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
      $queryRaw: async () => 1,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const service = new ParticipantScanService(prisma as never, { getPilotChurch: async () => pilot } as never);
    const leader: AuthUser = { userId: "u-lider", personId: "lider", email: "lider@example.test", grants: [{ roleCode: "LIDER_MINISTERIO", organizationId: "org", churchId: "riacho", ministryId: "mulheres" }] };
    const now = new Date("2026-11-20T18:00:00.000Z");
    await expect(service.scan(leader, "outro", ticket.code, now)).rejects.toMatchObject({ message: "Ingresso não pertence a este evento." });
    expect(audits).toHaveLength(0);
    const first = await service.scan(leader, "mocas", ticket.code, now);
    const second = await service.scan(leader, "mocas", ticket.code, now);
    expect(first).toMatchObject({ result: "READ", duplicate: false });
    expect(second).toMatchObject({ result: "ALREADY_READ", duplicate: true });
    expect(audits).toHaveLength(1);
  });
});

describe("escopos e bancos mock", () => {
  it("restringe a trilha vinculada e não contacta BRB nem Sicoob", () => {
    expect(() => assertOperationalScope(
      { userId: "l", personId: "p", email: "l@example.test", grants: [{ roleCode: "LIDER_MINISTERIO", organizationId: "org", churchId: "riacho" }] },
      [{ kind: "TRACK", scopeId: "trilha-a" }],
      "TRACK",
      "trilha-b",
    )).toThrow(ForbiddenException);
    expect(mockBankProbe("BRB")).toMatchObject({ live: false, synced: false, mode: "mock" });
    expect(mockBankProbe("SICOOB").reason).toContain("Nenhum banco foi contactado");
  });
});
