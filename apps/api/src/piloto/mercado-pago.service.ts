import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { paymentSettlement, ROLE_CODES, verifyMercadoPagoSignature } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { queueParticipantTicketNotices } from "../mail/check-in-notice";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

export interface GatewayPayment {
  id: string;
  status: "approved" | "refunded" | "pending" | "rejected";
  externalReference: string;
  grossCents: number;
  feeCents: number;
  dueOn?: string | null;
}

export interface MercadoPagoGateway {
  createPreference(input: { attemptRef: string; amountCents: number; title: string }): Promise<{ preferenceId: string; initPoint: string; mode: "mock" | "live" }>;
  getPayment(id: string): Promise<GatewayPayment | null>;
}

export class EnvMercadoPagoGateway implements MercadoPagoGateway {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async createPreference(input: { attemptRef: string; amountCents: number; title: string }) {
    const token = this.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!token || token === "mock") {
      return { preferenceId: `pref_${input.attemptRef}`, initPoint: `https://mock.mercadopago.test/checkout?ref=${encodeURIComponent(input.attemptRef)}`, mode: "mock" as const };
    }
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ title: input.title, quantity: 1, currency_id: "BRL", unit_price: input.amountCents / 100 }],
        external_reference: input.attemptRef,
      }),
    });
    if (!response.ok) throw new BadRequestException("O Mercado Pago não abriu o checkout.");
    const payload = await response.json() as { id?: string; init_point?: string };
    if (!payload.id || !payload.init_point) throw new BadRequestException("O Mercado Pago não devolveu o checkout.");
    return { preferenceId: payload.id, initPoint: payload.init_point, mode: "live" as const };
  }

  async getPayment(id: string): Promise<GatewayPayment | null> {
    const token = this.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!token || token === "mock") return null;
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new BadRequestException("Não foi possível consultar o pagamento.");
    const payload = await response.json() as {
      id?: number | string; status?: string; external_reference?: string;
      transaction_amount?: number; fee_details?: Array<{ amount?: number }>; date_of_expiration?: string;
    };
    const grossCents = Math.round(Number(payload.transaction_amount ?? 0) * 100);
    const feeCents = Math.round((payload.fee_details ?? []).reduce((sum, fee) => sum + Number(fee.amount ?? 0), 0) * 100);
    const status = payload.status === "approved" || payload.status === "refunded" || payload.status === "rejected" ? payload.status : "pending";
    return {
      id: String(payload.id ?? id), status, externalReference: payload.external_reference ?? "",
      grossCents, feeCents, dueOn: payload.date_of_expiration ?? null,
    };
  }
}

@Injectable()
export class MercadoPagoService {
  gateway: MercadoPagoGateway = new EnvMercadoPagoGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly mail?: MailService,
  ) {}

  async checkout(actor: AuthUser, registrationId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const intent = await this.prisma.eventPaymentIntent.findFirst({
      where: { registrationId, churchId: pilot.churchId, paymentProvider: "MERCADO_PAGO" },
      include: { registration: { select: { registrantPersonId: true } }, event: { select: { name: true } } },
    });
    if (!intent?.attemptRef) throw new NotFoundException("Tentativa de Mercado Pago não encontrada.");
    const owner = intent.registration.registrantPersonId === actor.personId;
    const treasury = actor.grants.some(grant => grant.roleCode === ROLE_CODES.TESOURARIA);
    if (!owner && !treasury) throw new ForbiddenException("A inscrição não pertence a esta sessão.");
    if (intent.status !== "PENDING") throw new ConflictException("Esta tentativa não está pendente.");
    const preference = await this.gateway.createPreference({
      attemptRef: intent.attemptRef, amountCents: intent.amountCents, title: intent.event.name,
    });
    return { attemptRef: intent.attemptRef, initPoint: preference.initPoint, mode: preference.mode };
  }

  async handleWebhook(input: { rawBody: string; timestamp: string; signature: string }) {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? "";
    if (!verifyMercadoPagoSignature(secret, input.timestamp, input.rawBody, input.signature)) {
      throw new UnauthorizedException("Assinatura do webhook inválida.");
    }
    const body = JSON.parse(input.rawBody) as { data?: { id?: string }; id?: string };
    const paymentId = body.data?.id ?? body.id;
    if (!paymentId) throw new BadRequestException("Pagamento ausente.");
    const payment = await this.gateway.getPayment(paymentId);
    if (!payment) throw new ConflictException("O pagamento não foi confirmado na consulta.");
    const idempotencyKey = `${payment.id}:${payment.status}`;
    const existing = await this.prisma.eventPaymentWebhookReceipt.findUnique({ where: { idempotencyKey } });
    if (existing) return { idempotencyKey, replay: true, resultStatus: existing.resultStatus };
    const intent = await this.prisma.eventPaymentIntent.findFirst({
      where: { attemptRef: payment.externalReference },
      include: { registration: true },
    });
    if (!intent) throw new NotFoundException("Tentativa não encontrada.");
    if (payment.status !== "approved" && payment.status !== "refunded") {
      await this.receipt(intent, idempotencyKey, payment.status, "IGNORED");
      return { idempotencyKey, replay: false, resultStatus: "IGNORED" };
    }
    const amounts = paymentSettlement(payment.grossCents, payment.feeCents);
    const bookkeeper = await this.prisma.user.findFirst({
      where: { status: "ACTIVE", grants: { some: { role: { code: ROLE_CODES.TESOURARIA }, churchId: intent.churchId } } },
      select: { id: true },
    });
    if (!bookkeeper) throw new ConflictException("Não há usuário da Tesouraria para registrar o lançamento.");
    const result = await this.prisma.$transaction(async tx => {
      if (payment.status === "approved") {
        if (intent.ledgerEntryId && intent.status === "CONFIRMED_GATEWAY") return "CONFIRMED";
        const claim = await tx.eventPaymentIntent.updateMany({
          where: { id: intent.id, ledgerEntryId: null, status: "PENDING" },
          data: {
            status: "CONFIRMED_GATEWAY", confirmedAt: new Date(), providerPaymentId: payment.id,
            grossCents: amounts.grossCents, feeCents: amounts.feeCents, netCents: amounts.netCents,
            dueOn: payment.dueOn ? new Date(payment.dueOn) : null,
          },
        });
        if (claim.count !== 1) return "CONFIRMED";
        const entry = await tx.ledgerEntry.create({
          data: {
            organizationId: intent.organizationId, churchId: intent.churchId, entryDate: new Date(),
            description: `Mercado Pago · bruto ${amounts.grossCents} · taxa ${amounts.feeCents} · líquido ${amounts.netCents}`.slice(0, 180),
            status: "APPROVED", amountCents: amounts.grossCents, createdByUserId: bookkeeper.id,
            submittedAt: new Date(),
          },
          select: { id: true },
        });
        await tx.eventPaymentIntent.update({ where: { id: intent.id }, data: { ledgerEntryId: entry.id } });
        await tx.eventRegistration.updateMany({
          where: { id: intent.registrationId, status: "PENDING_PAYMENT" },
          data: { status: "CONFIRMED", paymentStatus: "CONFIRMED_GATEWAY" },
        });
        return "CONFIRMED";
      }
      if (intent.refundedAt) return "REFUNDED";
      const refunded = await tx.eventPaymentIntent.updateMany({
        where: { id: intent.id, refundedAt: null, status: "CONFIRMED_GATEWAY" },
        data: { status: "REFUNDED", refundedAt: new Date() },
      });
      if (refunded.count !== 1) return "REFUNDED";
      if (intent.ledgerEntryId) {
        await tx.ledgerEntry.create({
          data: {
            organizationId: intent.organizationId, churchId: intent.churchId, entryDate: new Date(),
            description: `Estorno Mercado Pago · ${amounts.netCents}`, status: "APPROVED", amountCents: amounts.grossCents,
            createdByUserId: bookkeeper.id, reversalOfEntryId: intent.ledgerEntryId,
            submittedAt: new Date(),
          },
        });
      }
      await tx.eventRegistration.updateMany({
        where: { id: intent.registrationId, status: "CONFIRMED" },
        data: { paymentStatus: "REFUNDED" },
      });
      return "REFUNDED";
    });
    await this.receipt(intent, idempotencyKey, payment.status, result);
    if (result === "CONFIRMED") await this.deliverTickets(intent.registrationId, intent.eventId);
    return { idempotencyKey, replay: false, resultStatus: result };
  }

  private async receipt(intent: { id: string; organizationId: string; churchId: string }, idempotencyKey: string, eventType: string, resultStatus: string) {
    await this.prisma.eventPaymentWebhookReceipt.create({
      data: {
        organizationId: intent.organizationId, churchId: intent.churchId, paymentIntentId: intent.id,
        idempotencyKey, eventType, payloadHash: idempotencyKey, resultStatus,
      },
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return;
      throw error;
    });
  }

  private async deliverTickets(registrationId: string, eventId: string) {
    const [tickets, event] = await Promise.all([
      this.prisma.eventParticipantTicket.findMany({
        where: { registrationId },
        select: { id: true, position: true, code: true, participantEmail: true },
      }),
      this.prisma.portalEvent.findUnique({ where: { id: eventId }, select: { name: true } }),
    ]);
    await queueParticipantTicketNotices(this.mail, {
      eventName: event?.name ?? "evento",
      tickets: tickets.flatMap(ticket => ticket.participantEmail ? [{ ...ticket, email: ticket.participantEmail }] : []),
    });
  }
}
