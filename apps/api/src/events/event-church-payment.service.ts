import { ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import { randomBytes } from "node:crypto";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { queueEventCheckInNotice } from "../mail/check-in-notice";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { buildPixCopiaECola } from "./pix-payload";

@Injectable()
export class EventChurchPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    @Optional() private readonly mail?: MailService,
  ) {}

  async eventsForTreasury(actor: AuthUser) {
    const pilot = await this.treasuryScope(actor);
    const events = await this.prisma.portalEvent.findMany({
      where: {
        organizationId: pilot.organizationId, churchId: pilot.churchId,
        status: "PUBLISHED",
      },
      select: { id: true, name: true, slug: true, startsAt: true, status: true, locationText: true },
      orderBy: { startsAt: "desc" },
    });
    return { events };
  }

  async pending(actor: AuthUser, eventId: string) {
    const pilot = await this.treasuryScope(actor);
    const payments = await this.prisma.eventPaymentIntent.findMany({
      where: {
        eventId, organizationId: pilot.organizationId, churchId: pilot.churchId,
        status: "PENDING", receivingAccountId: { not: null },
        registration: { status: "PENDING_PAYMENT" },
      },
      select: {
        id: true, amountCents: true, pixTxid: true, createdAt: true,
        receivingAccount: { select: { displayName: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return { payments };
  }

  /**
   * A Tesouraria confirma o crédito visto no banco.
   * O lançamento e a confirmação da inscrição acontecem uma vez.
   */
  async reconcile(actor: AuthUser, paymentIntentId: string, bankCreditConfirmed: boolean,
    bankCreditReference?: string, bankCreditAmountCents?: number) {
    if (bankCreditConfirmed !== true) {
      throw new BusinessException(
        "Confirme o crédito visto no banco antes de registrar.",
        "BANK_CREDIT_NOT_CONFIRMED",
        400,
      );
    }
    const pilot = await this.treasuryScope(actor);
    const intent = await this.prisma.eventPaymentIntent.findFirst({
      where: { id: paymentIntentId, organizationId: pilot.organizationId, churchId: pilot.churchId },
      include: {
        registration: { include: { tickets: { orderBy: { position: "asc" }, select: { position: true, code: true } } } },
        event: { select: { id: true, name: true, ministry: { select: { slug: true } } } },
        receivingAccount: { include: { ledgerAccount: true } },
      },
    });
    if (!intent || !intent.receivingAccountId) {
      throw new NotFoundException("Pedido Pix desta congregação não encontrado.");
    }
    const reference = bankCreditReference?.trim().replace(/\s+/g, "").toUpperCase();
    const alreadyConfirmed = intent.ledgerEntryId && intent.status === "CONFIRMED_PIX";
    if (reference && intent.bankCreditReference && reference !== intent.bankCreditReference) {
      throw new BusinessException("Este pedido foi confirmado com outro crédito.", "BANK_CREDIT_REFERENCE_CHANGED", 409);
    }
    if (!alreadyConfirmed && (!reference || !/^[A-Z0-9][A-Z0-9._:/-]{5,79}$/.test(reference))) {
      throw new BusinessException("Informe a referência única do crédito no extrato.", "BANK_CREDIT_REFERENCE_REQUIRED", 400);
    }
    if ((!alreadyConfirmed || bankCreditAmountCents !== undefined) && bankCreditAmountCents !== intent.amountCents) {
      throw new BusinessException("O crédito no extrato tem valor diferente da inscrição.", "BANK_CREDIT_AMOUNT_MISMATCH", 409);
    }
    if (intent.ledgerEntryId && intent.status === "CONFIRMED_PIX") {
      const notice = await this.notify(intent);
      return {
        idempotentReplay: true,
        paymentIntentId: intent.id,
        ledgerEntryId: intent.ledgerEntryId,
        registrationId: intent.registrationId,
        status: intent.registration.status,
        notice,
      };
    }
    if (intent.status !== "PENDING" && !(intent.status === "CONFIRMED_PIX" && !intent.ledgerEntryId)) {
      throw new BusinessException("Este pedido não está pendente de conciliação.", "PAYMENT_NOT_PENDING", 409);
    }
    if (intent.registration.status !== "PENDING_PAYMENT") {
      throw new BusinessException("A inscrição não está aguardando pagamento.", "REGISTRATION_NOT_PENDING", 409);
    }
    const account = intent.receivingAccount;
    if (!account?.active || !account.ledgerAccount.active) {
      throw new BusinessException("A conta que receberia o Pix não está ativa.", "RECEIVING_ACCOUNT_INACTIVE", 409);
    }
    const revenue = await this.prisma.ledgerAccount.findFirst({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        active: true,
        type: "REVENUE",
      },
      orderBy: { code: "asc" },
    });
    if (!revenue) {
      throw new BusinessException(
        "O plano da igreja precisa de uma conta de receita ativa para registrar o crédito.",
        "REVENUE_ACCOUNT_MISSING",
        409,
      );
    }
    const ministryCode = intent.event.ministry?.slug;
    const costCenter = ministryCode ? await this.prisma.costCenter.findFirst({
      where: { organizationId: pilot.organizationId, churchId: pilot.churchId, code: ministryCode, active: true },
      select: { id: true },
    }) : null;
    if (ministryCode && !costCenter) {
      throw new BusinessException("Configure o centro de custo do ministério do evento.", "EVENT_COST_CENTER_MISSING", 409);
    }
    const now = new Date();
    const record = async (tx: Prisma.TransactionClient) => {
      const current = await tx.eventPaymentIntent.findUnique({ where: { id: intent.id } });
      if (current?.ledgerEntryId) {
        if (current.bankCreditReference && current.bankCreditReference !== reference) {
          throw new BusinessException("Este pedido foi confirmado com outro crédito.", "BANK_CREDIT_REFERENCE_CHANGED", 409);
        }
        return { ledgerEntryId: current.ledgerEntryId, replay: true };
      }
      const claim = await tx.eventPaymentIntent.updateMany({
        where: {
          id: intent.id,
          ledgerEntryId: null,
          status: current?.status === "CONFIRMED_PIX" ? "CONFIRMED_PIX" : "PENDING",
        },
        data: { status: "CONFIRMED_PIX", confirmedAt: now, bankCreditReference: reference },
      });
      if (claim.count !== 1) {
        throw new BusinessException("O crédito já foi registrado.", "PAYMENT_ALREADY_RECORDED", 409);
      }
      const entry = await tx.ledgerEntry.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          entryDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          description: `Inscrição de evento · ${intent.event.name}`.slice(0, 180),
          status: "APPROVED",
          amountCents: intent.amountCents,
          costCenterId: costCenter?.id,
          createdByUserId: actor.userId,
          submittedAt: now,
          firstApprovedByUserId: actor.userId,
          firstApprovedAt: now,
          competenceYear: now.getUTCFullYear(),
          competenceMonth: now.getUTCMonth() + 1,
          lines: {
            create: [
              { accountId: account.ledgerAccountId, side: "DEBIT", amountCents: intent.amountCents, memo: "pix-evento" },
              { accountId: revenue.id, side: "CREDIT", amountCents: intent.amountCents, memo: "pix-evento" },
            ],
          },
        },
        select: { id: true },
      });
      const linked = await tx.eventPaymentIntent.updateMany({
        where: { id: intent.id, ledgerEntryId: null, status: "CONFIRMED_PIX" },
        data: { ledgerEntryId: entry.id },
      });
      if (linked.count !== 1) {
        throw new BusinessException("O crédito já foi registrado.", "PAYMENT_ALREADY_RECORDED", 409);
      }
      const confirmed = await tx.eventRegistration.updateMany({
        where: { id: intent.registrationId, status: "PENDING_PAYMENT" },
        data: { status: "CONFIRMED", paymentStatus: "CONFIRMED_PIX" },
      });
      if (confirmed.count !== 1) {
        throw new BusinessException("A inscrição não está aguardando pagamento.", "REGISTRATION_NOT_PENDING", 409);
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "event_payment.church_reconcile",
          resourceType: "event_payment_intent",
          resourceId: intent.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            ledgerEntryId: entry.id,
            amountCents: intent.amountCents,
            registrationId: intent.registrationId,
            receivingAccountId: account.id,
          },
        },
      });
      return { ledgerEntryId: entry.id, replay: false };
    };
    const recorded = await this.prisma.$transaction(record).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new BusinessException("Esse crédito já foi registrado para outra inscrição.", "BANK_CREDIT_ALREADY_USED", 409);
      }
      throw error;
    });
    const notice = await this.notify(intent);
    return {
      idempotentReplay: recorded.replay,
      paymentIntentId: intent.id,
      ledgerEntryId: recorded.ledgerEntryId,
      registrationId: intent.registrationId,
      status: "CONFIRMED",
      notice,
    };
  }

  pixFor(input: {
    pixKey: string;
    merchantName: string;
    merchantCity: string;
    amountCents: number;
  }) {
    const txid = randomBytes(8).toString("hex");
    return { txid, copiaECola: buildPixCopiaECola({ ...input, txid }) };
  }

  private async notify(intent: {
    registrationId: string;
    registration: { notificationEmail?: string | null; checkInCode: string; status: string; tickets?: { position: number; code: string }[] };
    event: { name: string };
  }) {
    if (!intent.registration.notificationEmail) return { queued: false as const };
    return queueEventCheckInNotice(this.mail, {
      registrationId: intent.registrationId,
      to: intent.registration.notificationEmail,
      eventName: intent.event.name,
      checkInCode: intent.registration.checkInCode,
      tickets: intent.registration.tickets,
    });
  }

  private async treasuryScope(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !hasAccess(actor.grants, {
        roleCodes: [ROLE_CODES.TESOURARIA],
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      }) ||
      (actor.churchId && actor.churchId !== pilot.churchId) ||
      (actor.organizationId && actor.organizationId !== pilot.organizationId)
    ) {
      throw new ForbiddenException("Somente a Tesouraria confirma o crédito nesta congregação.");
    }
    return pilot;
  }
}
