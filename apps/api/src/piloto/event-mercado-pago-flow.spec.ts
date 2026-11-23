import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { issueConfirmedParticipantTickets } from "../events/issue-participant-tickets";
import type { AuthUser } from "../auth/types/auth-user";
import { ParticipantScanService } from "./participant-scan.service";
import { mercadoPagoManifest, signMercadoPagoManifest } from "./mercado-pago-signature";
import { EnvMercadoPagoGateway, MercadoPagoService, mercadoPagoPreferenceBody, type GatewayPayment } from "./mercado-pago.service";

const pilot = { organizationId: "org", churchId: "riacho", organizationSlug: "org", churchSlug: "riacho", churchName: "Riacho" };
const guest: AuthUser = {
  userId: "u-ana", personId: "ana", email: "ana@example.test",
  grants: [{ roleCode: "CONVIDADO", organizationId: "org", churchId: "riacho" }],
};
const leader: AuthUser = {
  userId: "u-lider", personId: "lider", email: "lider@example.test",
  grants: [{ roleCode: "LIDER_MINISTERIO", organizationId: "org", churchId: "riacho", ministryId: "mulheres" }],
};
const secret = "segredo-de-teste";

function header(dataId: string) {
  const ts = "1700000000";
  return `ts=${ts},v1=${signMercadoPagoManifest(secret, mercadoPagoManifest({ dataId, requestId: "req-1", ts }))}`;
}

function harness(options?: { minor?: boolean; cancelled?: boolean }) {
  const registration = {
    id: "reg",
    status: options?.cancelled ? "CANCELLED" : "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    isMinor: Boolean(options?.minor),
    guardianAuthStatus: options?.minor ? "PENDING" : "NOT_REQUIRED",
    partySize: 2,
    displayName: "Ana",
    notificationEmail: "ana@example.test",
    checkInCode: "c".repeat(32),
    participantRoster: [
      { name: "Ana", email: "ana@example.test" },
      { name: "Bia", email: "bia@example.test" },
    ],
    eventId: "evt",
    registrantPersonId: "ana",
  };
  const intent = {
    id: "pay", organizationId: "org", churchId: "riacho", registrationId: "reg", eventId: "evt",
    attemptRef: "mp_1", status: "PENDING", ledgerEntryId: null as string | null, refundedAt: null as Date | null,
    amountCents: 10000, currency: "BRL", paymentProvider: "MERCADO_PAGO", receivingAccountId: "conta",
    get registration() { return registration; },
    event: { id: "evt", status: "PUBLISHED", name: "Encontro" },
  };
  const receipts: Array<{ idempotencyKey: string; resultStatus: string; paymentIntentId: string }> = [];
  const entries: Array<Record<string, unknown>> = [];
  const tickets: Array<{
    id: string; registrationId: string; position: number; code: string;
    participantName: string; participantEmail: string | null; checkedInAt: Date | null; scannedByUserId: string | null;
  }> = [];
  const mails: Array<{ to: string; idempotencyKey: string }> = [];
  const event = {
    id: "evt", ministryId: "mulheres", createdByUserId: "criador", status: "PUBLISHED", name: "Encontro",
    startsAt: new Date("2026-11-20T15:00:00.000Z"), endsAt: null,
    ministry: { leaderPersonId: "lider" }, organizationId: "org", churchId: "riacho",
  };
  const prisma = {
    eventPaymentWebhookReceipt: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => receipts.find(item => item.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: { idempotencyKey: string; resultStatus: string; paymentIntentId: string } }) => { receipts.push(data); return data; },
    },
    eventPaymentIntent: {
      findFirst: async () => intent,
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(intent, data),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (data.status === "CONFIRMED_GATEWAY" && (intent.ledgerEntryId || intent.status !== "PENDING")) return { count: 0 };
        if (data.status === "REFUNDED") {
          if (intent.refundedAt) return { count: 0 };
          Object.assign(intent, data);
          return { count: 1 };
        }
        Object.assign(intent, data);
        return { count: 1 };
      },
    },
    user: { findFirst: async () => ({ id: "tesoureiro" }) },
    churchReceivingAccount: { findFirst: async () => ({ ledgerAccountId: "banco" }) },
    ledgerAccount: { findFirst: async ({ where }: { where: { type: string } }) => ({ id: where.type === "EXPENSE" ? "taxa" : "receita" }) },
    ledgerEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `led-${entries.length + 1}`, ...data };
        entries.push(row);
        intent.ledgerEntryId = String(row.id);
        return row;
      },
    },
    eventRegistration: {
      updateMany: async ({ data }: { data: { status?: string; paymentStatus?: string } }) => {
        if (data.status && registration.status === "PENDING_PAYMENT") registration.status = data.status;
        if (data.paymentStatus) registration.paymentStatus = data.paymentStatus;
        return { count: 1 };
      },
      findUnique: async () => ({
        ...registration,
        event: { name: "Encontro", ticketPolicy: "PARTICIPANT" },
        tickets: tickets.filter(ticket => ticket.registrationId === registration.id),
      }),
    },
    eventParticipantTicket: {
      createMany: async ({ data }: { data: Array<Record<string, string | number | null>> }) => {
        for (const row of data) {
          if (tickets.some(ticket => ticket.registrationId === row.registrationId && ticket.position === Number(row.position))) continue;
          tickets.push({
            id: `t-${tickets.length + 1}`, registrationId: String(row.registrationId), position: Number(row.position),
            code: String(row.code), participantName: String(row.participantName ?? ""),
            participantEmail: row.participantEmail ? String(row.participantEmail) : null,
            checkedInAt: null, scannedByUserId: null,
          });
        }
        return { count: data.length };
      },
      findMany: async () => tickets,
      findFirst: async ({ where }: { where: { code?: string } }) => {
        const ticket = tickets.find(item => item.code === where.code);
        if (!ticket) return null;
        return {
          ...ticket,
          registration: {
            id: registration.id, eventId: registration.eventId, status: registration.status,
            paymentStatus: registration.paymentStatus, churchId: "riacho",
            isMinor: registration.isMinor, guardianAuthStatus: registration.guardianAuthStatus,
          },
        };
      },
      findUnique: async ({ where }: { where: { id: string } }) => tickets.find(ticket => ticket.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string }; data: { checkedInAt: Date; scannedByUserId: string } }) => {
        const ticket = tickets.find(item => item.id === where.id);
        if (!ticket || ticket.checkedInAt) return { count: 0 };
        ticket.checkedInAt = data.checkedInAt;
        ticket.scannedByUserId = data.scannedByUserId;
        return { count: 1 };
      },
      count: async () => tickets.filter(ticket => ticket.checkedInAt == null).length,
    },
    portalEvent: {
      findFirst: async ({ where }: { where: { id: string } }) => where.id === "evt" ? event : where.id === "outro" ? { ...event, id: "outro" } : null,
    },
    eventScannerGrant: { findFirst: async () => null },
    auditLog: { create: async () => ({}) },
    $queryRaw: async () => 1,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  const gateway = {
    createPreference: async () => ({ preferenceId: "pref", initPoint: "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref", mode: "mock" as const }),
    getPayment: async (id: string): Promise<GatewayPayment> => ({
      id, status: "approved", currency: "BRL", externalReference: "mp_1", grossCents: 10000, feeCents: 390,
    }),
  };
  const mail = {
    deliverOnce: async (message: { to: string; idempotencyKey: string }) => {
      if (mails.some(item => item.idempotencyKey === message.idempotencyKey)) {
        return { status: "SENT" as const, idempotentReplay: true, providerMessageId: "test" };
      }
      mails.push({ to: message.to, idempotencyKey: message.idempotencyKey });
      return { status: "SENT" as const, idempotentReplay: false, providerMessageId: "test" };
    },
  };
  const service = new MercadoPagoService(prisma as never, { getPilotChurch: async () => pilot } as never, mail as never);
  service.gateway = gateway;
  const scan = new ParticipantScanService(prisma as never, { getPilotChurch: async () => pilot } as never);
  return { registration, intent, entries, tickets, mails, service, scan, gateway, prisma };
}

describe("fluxo sandbox de eventos no Mercado Pago", () => {
  const previousSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const previousFetch = global.fetch;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    else process.env.MERCADO_PAGO_WEBHOOK_SECRET = previousSecret;
    global.fetch = previousFetch;
  });

  it("expõe configuração inválida e não confirma pela preferência", async () => {
    const calls: string[] = [];
    global.fetch = (async (url: string) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ id: "pref-1", sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1" }) };
    }) as typeof fetch;
    await expect(new EnvMercadoPagoGateway({ MERCADO_PAGO_ENV: "live", MERCADO_PAGO_ACCESS_TOKEN: "APP" }).createPreference({
      attemptRef: "mp_1", amountCents: 1000, title: "Encontro",
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(new EnvMercadoPagoGateway({ MERCADO_PAGO_ENV: "sandbox" }).createPreference({
      attemptRef: "mp_1", amountCents: 1000, title: "Encontro",
    })).rejects.toThrow(/sem token de teste/);
    await expect(new EnvMercadoPagoGateway({ MERCADO_PAGO_ENV: "sandbox", MERCADO_PAGO_ACCESS_TOKEN: "mock" }).getPayment("pay-1"))
      .rejects.toThrow(/sem token de teste/);
    const mock = await new EnvMercadoPagoGateway({ MERCADO_PAGO_ENV: "mock" }).createPreference({
      attemptRef: "mp_1", amountCents: 1000, title: "Encontro",
    });
    expect(mock.mode).toBe("mock");
    await expect(new EnvMercadoPagoGateway({}).getPayment("pay-1")).rejects.toThrow(/fixture assinada/);
    const sandbox = await new EnvMercadoPagoGateway({
      MERCADO_PAGO_ENV: "sandbox", MERCADO_PAGO_ACCESS_TOKEN: "TEST-token",
    }).createPreference({ attemptRef: "mp_1", amountCents: 1500, title: "Encontro" });
    expect(sandbox.mode).toBe("sandbox");
    expect(sandbox.initPoint.startsWith("https://sandbox.mercadopago.com.br/")).toBe(true);
    const body = mercadoPagoPreferenceBody({ attemptRef: "mp_1", amountCents: 1500, title: "Encontro" });
    expect(body).not.toHaveProperty("auto_return");
    expect(body).not.toHaveProperty("back_urls");
    expect(JSON.stringify(body)).not.toMatch(/excluded_payment/);
    expect(calls).toEqual(["https://api.mercadopago.com/checkout/preferences"]);
  });

  it("confirma uma vez pelo webhook assinado, emite um QR por participante e estorna uma vez", async () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret;
    const { registration, entries, tickets, mails, service, scan, gateway } = harness();
    const opened = await service.checkout(guest, "reg");
    expect(opened).toMatchObject({ mode: "mock", attemptRef: "mp_1" });
    expect(registration.status).toBe("PENDING_PAYMENT");
    await expect(service.checkout({ ...guest, personId: "outra" }, "reg")).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.handleWebhook({
      signatureHeader: header("pay-1").replace(/v1=[a-f0-9]+/, `v1=${"0".repeat(64)}`),
      requestId: "req-1", dataId: "pay-1",
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tickets).toHaveLength(0);

    const first = await service.handleWebhook({ signatureHeader: header("pay-1"), requestId: "req-1", dataId: "pay-1" });
    const replay = await service.handleWebhook({ signatureHeader: header("pay-1"), requestId: "req-1", dataId: "pay-1" });
    expect(first).toMatchObject({ replay: false, resultStatus: "CONFIRMED" });
    expect(replay).toMatchObject({ replay: true, resultStatus: "CONFIRMED" });
    expect(registration).toMatchObject({ status: "CONFIRMED", paymentStatus: "CONFIRMED_GATEWAY" });
    expect(tickets.map(ticket => ticket.participantEmail)).toEqual(["ana@example.test", "bia@example.test"]);
    expect(mails.map(message => message.to)).toEqual(["ana@example.test", "bia@example.test"]);
    expect(new Set(tickets.map(ticket => ticket.code)).size).toBe(2);
    expect(entries).toHaveLength(1);

    const now = new Date("2026-11-20T18:00:00.000Z");
    await expect(scan.scan(leader, "outro", tickets[0].code, now)).rejects.toThrow(/não pertence a este evento/);
    const read = await scan.scan(leader, "evt", tickets[0].code, now);
    const again = await scan.scan(leader, "evt", tickets[0].code, now);
    expect(read).toMatchObject({ result: "READ", duplicate: false });
    expect(again).toMatchObject({ result: "ALREADY_READ", duplicate: true });

    gateway.getPayment = async () => ({
      id: "pay-1-refund", status: "refunded", currency: "BRL", externalReference: "mp_1", grossCents: 10000, feeCents: 390,
    });
    const refunded = await service.handleWebhook({ signatureHeader: header("pay-1-refund"), requestId: "req-1", dataId: "pay-1-refund" });
    const refundReplay = await service.handleWebhook({ signatureHeader: header("pay-1-refund"), requestId: "req-1", dataId: "pay-1-refund" });
    expect(refunded).toMatchObject({ replay: false, resultStatus: "REFUNDED" });
    expect(refundReplay).toMatchObject({ replay: true, resultStatus: "REFUNDED" });
    expect(entries.filter(entry => entry.reversalOfEntryId)).toHaveLength(1);
    expect(registration.paymentStatus).toBe("REFUNDED");
    await expect(scan.scan(leader, "evt", tickets[1].code, now)).rejects.toThrow(/estornado/);
    expect(mails.every(message => message.to.endsWith("@example.test"))).toBe(true);
  });

  it("segura o ingresso do menor até a autorização e não emite em cancelamento ou valor divergente", async () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret;
    const minor = harness({ minor: true });
    const confirmed = await minor.service.handleWebhook({ signatureHeader: header("pay-1"), requestId: "req-1", dataId: "pay-1" });
    expect(confirmed.resultStatus).toBe("CONFIRMED");
    expect(minor.tickets).toHaveLength(0);
    expect(minor.mails).toHaveLength(0);
    minor.registration.guardianAuthStatus = "AUTHORIZED";
    const issued = await issueConfirmedParticipantTickets(minor.prisma as never, {
      deliverOnce: async (message: { to: string; idempotencyKey: string }) => {
        minor.mails.push({ to: message.to, idempotencyKey: message.idempotencyKey });
        return { status: "SENT", idempotentReplay: false, providerMessageId: "test" };
      },
    } as never, "reg");
    expect(issued).toMatchObject({ issued: 2, emailed: 2, held: null });
    expect(minor.tickets).toHaveLength(2);

    const cancelled = harness({ cancelled: true });
    const blocked = await cancelled.service.handleWebhook({ signatureHeader: header("pay-1"), requestId: "req-1", dataId: "pay-1" });
    expect(blocked.resultStatus).toBe("CANCELLED");
    expect(cancelled.tickets).toHaveLength(0);
    expect(cancelled.entries).toHaveLength(0);

    const mismatched = harness();
    mismatched.gateway.getPayment = async (id: string) => ({
      id, status: "approved", currency: "BRL", externalReference: "mp_1", grossCents: 1, feeCents: 0,
    });
    await expect(mismatched.service.handleWebhook({ signatureHeader: header("pay-1"), requestId: "req-1", dataId: "pay-1" }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(mismatched.tickets).toHaveLength(0);

    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    await expect(harness().service.handleWebhook({ signatureHeader: header("pay-1"), requestId: "req-1", dataId: "pay-1" }))
      .rejects.toThrow(/MERCADO_PAGO_WEBHOOK_SECRET não está configurado/);
  });
});
