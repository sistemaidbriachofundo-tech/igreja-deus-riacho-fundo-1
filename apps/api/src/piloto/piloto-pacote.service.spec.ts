import { ConflictException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { mercadoPagoSignature, publicPasswordResetBody } from "@idbrf/shared";
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
    const list = await service.listPrayers(otherPastor);
    expect(JSON.stringify(list)).not.toContain("Exemplo");
    expect(list.requests[0].canReadText).toBe(false);
    await expect(service.readPrayer(otherPastor, "ora")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.readPrayer(pastor, "ora")).resolves.toMatchObject({ body: "Pedido fictício pela família Exemplo" });
    const notice = await service.bells(otherPastor);
    expect(notice.notices[0].title).toBe("Há um pedido de oração");
    expect(JSON.stringify(notice)).not.toContain("Exemplo");
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
    expect(first).toMatchObject({ skipped: false, created: 2, title: "Há aniversariantes hoje na congregação." });
    const second = await service.run(secretaria, new Date("2026-11-20T15:00:00.000Z"));
    expect(second).toMatchObject({ created: 0 });
    expect(notices.map(item => item.recipientPersonId).sort()).toEqual(["ana", "mentor"]);
  });
});

describe("Mercado Pago e leitura do ingresso", () => {
  it("consulta o pagamento antes de confirmar, não duplica o lançamento e estorna uma vez", async () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = "segredo-de-teste";
    const intents: Array<{
      id: string; organizationId: string; churchId: string; registrationId: string; eventId: string;
      attemptRef: string; status: string; ledgerEntryId: string | null; refundedAt: Date | null;
      amountCents: number; registration: { id: string; registrantPersonId: string };
    }> = [{
      id: "pay", organizationId: "org", churchId: "riacho", registrationId: "reg", eventId: "evt",
      attemptRef: "mp_1", status: "PENDING", ledgerEntryId: null, refundedAt: null, amountCents: 10000,
      registration: { id: "reg", registrantPersonId: "ana" },
    }];
    const entries: Array<Record<string, unknown>> = [];
    const receipts: Array<Record<string, unknown>> = [];
    let queries = 0;
    const gateway = {
      createPreference: async () => ({ preferenceId: "pref", initPoint: "https://mock.mercadopago.test/checkout?ref=mp_1", mode: "mock" as const }),
      getPayment: async (id: string): Promise<GatewayPayment> => {
        queries += 1;
        return { id, status: queries < 3 ? "approved" : "refunded", externalReference: "mp_1", grossCents: 10000, feeCents: 390 };
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
      ledgerEntry: { create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `led-${entries.length + 1}`, ...data }; entries.push(row); intents[0].ledgerEntryId = String(row.id); return row; } },
      eventRegistration: { updateMany: async () => ({ count: 1 }) },
      eventParticipantTicket: { findMany: async () => [] },
      portalEvent: { findUnique: async () => ({ name: "Encontro" }) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const service = new MercadoPagoService(prisma as never, { getPilotChurch: async () => pilot } as never);
    service.gateway = gateway;
    const raw = JSON.stringify({ data: { id: "pay-1" } });
    const timestamp = "1700000000";
    const signature = mercadoPagoSignature("segredo-de-teste", timestamp, raw);
    await expect(service.handleWebhook({ rawBody: raw, timestamp, signature: "0".repeat(64) })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queries).toBe(0);
    const first = await service.handleWebhook({ rawBody: raw, timestamp, signature });
    const replay = await service.handleWebhook({ rawBody: raw, timestamp, signature });
    expect(first).toMatchObject({ replay: false, resultStatus: "CONFIRMED" });
    expect(replay).toMatchObject({ replay: true, resultStatus: "CONFIRMED" });
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toContain("bruto 10000");
    expect(entries[0].description).toContain("taxa 390");
    expect(entries[0].description).toContain("líquido 9610");
    const refundRaw = JSON.stringify({ data: { id: "pay-1-refund" } });
    const refundSignature = mercadoPagoSignature("segredo-de-teste", timestamp, refundRaw);
    gateway.getPayment = async () => ({ id: "pay-1-refund", status: "refunded", externalReference: "mp_1", grossCents: 10000, feeCents: 390 });
    await service.handleWebhook({ rawBody: refundRaw, timestamp, signature: refundSignature });
    await service.handleWebhook({ rawBody: refundRaw, timestamp, signature: refundSignature });
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
