import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { paymentSettlement, ROLE_CODES } from "@idbrf/shared";
import { verifyMercadoPagoWebhook } from "./mercado-pago-signature";
import type { AuthUser } from "../auth/types/auth-user";
import { queueParticipantTicketNotices } from "../mail/check-in-notice";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

export interface GatewayPayment {
  id: string;
  status: "approved" | "refunded" | "pending" | "rejected" | "cancelled";
  externalReference: string;
  currency: string;
  grossCents: number;
  feeCents: number;
  dueOn?: string | null;
}

export interface MercadoPagoGateway {
  createPreference(input: { attemptRef: string; amountCents: number; title: string }): Promise<{ preferenceId: string; initPoint: string; mode: "mock" | "sandbox" }>;
  getPayment(id: string): Promise<GatewayPayment | null>;
}

export class EnvMercadoPagoGateway implements MercadoPagoGateway {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async createPreference(input: { attemptRef: string; amountCents: number; title: string }) {
    const token = this.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    const stage = this.env.MERCADO_PAGO_ENV?.trim();
    if (stage === "live") {
      throw new BadRequestException("A cobrança real do Mercado Pago não está habilitada. Use o mock ou o sandbox.");
    }
    if (!token || token === "mock" || stage !== "sandbox") {
      return { preferenceId: `pref_${input.attemptRef}`, initPoint: `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref_${encodeURIComponent(input.attemptRef)}`, mode: "mock" as const };
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
    return { preferenceId: payload.id, initPoint: payload.init_point, mode: "sandbox" as const };
  }

  async getPayment(id: string): Promise<GatewayPayment | null> {
    const token = this.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    const stage = this.env.MERCADO_PAGO_ENV?.trim();
    if (!token || token === "mock" || stage !== "sandbox") return null;
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
    const status = payload.status === "approved" || payload.status === "refunded" || payload.status === "rejected" || payload.status === "cancelled" ? payload.status : "pending";
    const currency = String((payload as { currency_id?: string }).currency_id ?? "");
    return {
      id: String(payload.id ?? id), status, externalReference: payload.external_reference ?? "",
      currency, grossCents, feeCents, dueOn: payload.date_of_expiration ?? null,
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

  async handleWebhook(input: { signatureHeader: string; requestId: string; dataId: string }) {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? "";
    if (!verifyMercadoPagoWebhook({
      secret, signatureHeader: input.signatureHeader, requestId: input.requestId, dataId: input.dataId,
    })) {
      throw new UnauthorizedException("Assinatura do webhook inválida.");
    }
    const payment = await this.gateway.getPayment(input.dataId);
    if (!payment || payment.id !== input.dataId) throw new ConflictException("O pagamento não foi confirmado na consulta.");
    const idempotencyKey = `${payment.id}:${payment.status}`;
    const existing = await this.prisma.eventPaymentWebhookReceipt.findUnique({ where: { idempotencyKey } });
    if (existing) return { idempotencyKey, replay: true, resultStatus: existing.resultStatus };
    const intent = await this.prisma.eventPaymentIntent.findFirst({
      where: { attemptRef: payment.externalReference },
      include: { registration: true, event: { select: { id: true, status: true, name: true } } },
    });
    if (!intent) throw new NotFoundException("Tentativa não encontrada.");
    if (intent.paymentProvider !== "MERCADO_PAGO") throw new ConflictException("A tentativa não é Mercado Pago.");
    if (payment.currency !== "BRL" || intent.currency !== "BRL") throw new ConflictException("A moeda precisa ser BRL.");
    if (payment.grossCents !== intent.amountCents) throw new ConflictException("O valor consultado difere da inscrição.");
    if (intent.registration.status === "CANCELLED" || intent.event.status === "CANCELLED" || intent.event.status === "ARCHIVED") {
      await this.receipt(intent, idempotencyKey, payment.status, "CANCELLED");
      return { idempotencyKey, replay: false, resultStatus: "CANCELLED" };
    }
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
    const accounts = await this.ledgerAccounts(intent.churchId, intent.receivingAccountId, amounts.feeCents > 0);
    const result = await this.prisma.$transaction(async tx => {
      if (payment.status === "approved") {
        if (intent.registration.status !== "PENDING_PAYMENT" && intent.status === "CONFIRMED_GATEWAY") return "CONFIRMED";
        if (intent.registration.status !== "PENDING_PAYMENT") return "IGNORED";
        const claim = await tx.eventPaymentIntent.updateMany({
          where: { id: intent.id, ledgerEntryId: null, status: "PENDING", paymentProvider: "MERCADO_PAGO" },
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
            lines: { create: this.entryLines(accounts, amounts) },
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
      if (intent.refundedAt || intent.registration.paymentStatus === "REFUNDED") return "REFUNDED";
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
            createdByUserId: bookkeeper.id, reversalOfEntryId: intent.ledgerEntryId, submittedAt: new Date(),
            lines: { create: this.entryLines(accounts, amounts).map(line => ({ ...line, side: line.side === "DEBIT" ? "CREDIT" : "DEBIT" })) },
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

  private async ledgerAccounts(churchId: string, receivingAccountId: string | null, needsFee: boolean) {
    const bank = receivingAccountId ? await this.prisma.churchReceivingAccount.findFirst({
      where: { id: receivingAccountId, churchId, active: true },
      select: { ledgerAccountId: true },
    }) : null;
    const revenue = await this.prisma.ledgerAccount.findFirst({
      where: { churchId, active: true, type: "REVENUE" }, orderBy: { code: "asc" }, select: { id: true },
    });
    const expense = needsFee ? await this.prisma.ledgerAccount.findFirst({
      where: { churchId, active: true, type: "EXPENSE" }, orderBy: { code: "asc" }, select: { id: true },
    }) : null;
    if (!bank || !revenue || (needsFee && !expense)) {
      throw new ConflictException("O plano da igreja precisa da conta de recebimento, da receita e da despesa da taxa.");
    }
    return { bankId: bank.ledgerAccountId, revenueId: revenue.id, expenseId: expense?.id ?? null };
  }

  private entryLines(accounts: { bankId: string; revenueId: string; expenseId: string | null }, amounts: { grossCents: number; feeCents: number; netCents: number }) {
    const lines = [
      { accountId: accounts.bankId, side: "DEBIT" as const, amountCents: amounts.netCents, memo: "mercado-pago-liquido" },
      { accountId: accounts.revenueId, side: "CREDIT" as const, amountCents: amounts.grossCents, memo: "mercado-pago-bruto" },
    ];
    if (amounts.feeCents > 0 && accounts.expenseId) {
      lines.splice(1, 0, { accountId: accounts.expenseId, side: "DEBIT", amountCents: amounts.feeCents, memo: "mercado-pago-taxa" });
    }
    return lines;
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
