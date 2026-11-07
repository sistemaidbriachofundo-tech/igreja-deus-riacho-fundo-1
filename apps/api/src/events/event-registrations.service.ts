import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import type { AuthUser } from "../auth/types/auth-user";
import {
  assertMinistryScopedWrite,
  filterRowsForMinistryLeader,
} from "../common/ministry-access";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

const OCCUPYING_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] as const;

export type ModalityInput = {
  code?: string;
  name?: string;
  kind?: "INDIVIDUAL" | "COUPLE" | "FAMILY" | "CUSTOM";
  capacity?: number | null;
  minPartySize?: number;
  maxPartySize?: number;
  sortOrder?: number;
};

export type LotInput = {
  code?: string;
  name?: string;
  modalityId?: string | null;
  capacity?: number | null;
  priceCents?: number;
  currency?: string;
  opensAt?: string | null;
  closesAt?: string | null;
  status?: "DRAFT" | "OPEN" | "CLOSED";
  sortOrder?: number;
};

export type RegistrationInput = {
  displayName?: string;
  modalityId?: string;
  lotId?: string | null;
  lodgingOptionId?: string | null;
  mealOptionId?: string | null;
  transportOptionId?: string | null;
  partySize?: number;
  isMinor?: boolean;
  guardianDisplayName?: string | null;
  /** Ciência sintética do responsável — obrigatória quando isMinor=true. */
  guardianAcknowledged?: boolean;
};

export type LodgingOptionInput = {
  code?: string;
  name?: string;
  kind?: "NONE" | "SHARED" | "COUPLE" | "FAMILY" | "CUSTOM";
  capacity?: number | null;
  sortOrder?: number;
};

export type MealOptionInput = {
  code?: string;
  name?: string;
  kind?:
    | "NONE"
    | "BREAKFAST"
    | "LUNCH"
    | "DINNER"
    | "FULL_BOARD"
    | "CUSTOM";
  capacity?: number | null;
  sortOrder?: number;
};

export type TransportOptionInput = {
  code?: string;
  name?: string;
  kind?: "NONE" | "OWN" | "EVENT_BUS" | "CARPOOL" | "CUSTOM";
  capacity?: number | null;
  sortOrder?: number;
};

const DEFAULT_GUARDIAN_ACK =
  "Autorização sintética de responsável para participação do menor no evento (sem PII real).";

const LODGING_KINDS = ["NONE", "SHARED", "COUPLE", "FAMILY", "CUSTOM"] as const;
const MEAL_KINDS = [
  "NONE",
  "BREAKFAST",
  "LUNCH",
  "DINNER",
  "FULL_BOARD",
  "CUSTOM",
] as const;
const TRANSPORT_KINDS = [
  "NONE",
  "OWN",
  "EVENT_BUS",
  "CARPOOL",
  "CUSTOM",
] as const;

@Injectable()
export class EventRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async createModality(actor: AuthUser, eventId: string, input: ModalityInput) {
    const { pilot, event } = await this.requireEventWrite(actor, eventId);
    const code = input.code?.trim().toLowerCase();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException("code e name são obrigatórios");
    }
    const kind = input.kind ?? "INDIVIDUAL";
    if (!["INDIVIDUAL", "COUPLE", "FAMILY", "CUSTOM"].includes(kind)) {
      throw new BadRequestException("kind inválido");
    }
    const minPartySize = input.minPartySize ?? defaultMinParty(kind);
    const maxPartySize = input.maxPartySize ?? defaultMaxParty(kind);
    if (minPartySize < 1 || maxPartySize < minPartySize) {
      throw new BadRequestException("party size inválido");
    }
    if (input.capacity != null && input.capacity < 1) {
      throw new BadRequestException("capacity inválida");
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.eventModality.create({
        data: {
          eventId: event.id,
          code,
          name,
          kind,
          capacity: input.capacity ?? null,
          minPartySize,
          maxPartySize,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "event_modality.create",
          resourceType: "event_modality",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { eventId, code, kind },
        },
      });
      return this.toModalityDto(row);
    });
  }

  async listModalities(actor: AuthUser, eventId: string) {
    const { event } = await this.requireEventWrite(actor, eventId);
    const rows = await this.prisma.eventModality.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const occupied = await this.occupiedByModality(event.id);
    return {
      eventId: event.id,
      modalities: rows.map((r) =>
        this.toModalityDto(r, occupied.get(r.id) ?? 0),
      ),
    };
  }

  async createLot(actor: AuthUser, eventId: string, input: LotInput) {
    const { pilot, event } = await this.requireEventWrite(actor, eventId);
    const code = input.code?.trim().toLowerCase();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException("code e name são obrigatórios");
    }
    const priceCents = input.priceCents ?? 0;
    if (priceCents < 0) {
      throw new BadRequestException("priceCents inválido");
    }
    if (input.capacity != null && input.capacity < 1) {
      throw new BadRequestException("capacity inválida");
    }
    const modalityId: string | null = input.modalityId ?? null;
    if (modalityId) {
      const modality = await this.prisma.eventModality.findFirst({
        where: { id: modalityId, eventId: event.id },
      });
      if (!modality) {
        throw new BadRequestException("modalityId inválido para o evento");
      }
    }
    const status = input.status ?? "DRAFT";
    if (!["DRAFT", "OPEN", "CLOSED"].includes(status)) {
      throw new BadRequestException("status inválido");
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.eventLot.create({
        data: {
          eventId: event.id,
          modalityId,
          code,
          name,
          capacity: input.capacity ?? null,
          priceCents,
          currency: (input.currency ?? "BRL").trim() || "BRL",
          opensAt:
            input.opensAt === undefined || input.opensAt === null
              ? null
              : parseDate(input.opensAt, "opensAt"),
          closesAt:
            input.closesAt === undefined || input.closesAt === null
              ? null
              : parseDate(input.closesAt, "closesAt"),
          status,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "event_lot.create",
          resourceType: "event_lot",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { eventId, code, priceCents, status },
        },
      });
      return this.toLotDto(row);
    });
  }

  async listLots(actor: AuthUser, eventId: string) {
    const { event } = await this.requireEventWrite(actor, eventId);
    const rows = await this.prisma.eventLot.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const occupied = await this.occupiedByLot(event.id);
    return {
      eventId: event.id,
      lots: rows.map((r) => this.toLotDto(r, occupied.get(r.id) ?? 0)),
    };
  }

  async createLodgingOption(
    actor: AuthUser,
    eventId: string,
    input: LodgingOptionInput,
  ) {
    const { pilot, event } = await this.requireEventWrite(actor, eventId);
    const code = input.code?.trim().toLowerCase();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException("code e name são obrigatórios");
    }
    const kind = input.kind ?? "CUSTOM";
    if (!LODGING_KINDS.includes(kind)) {
      throw new BadRequestException("kind de hospedagem inválido");
    }
    if (input.capacity != null && input.capacity < 1) {
      throw new BadRequestException("capacity inválida");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.eventLodgingOption.create({
        data: {
          eventId: event.id,
          code,
          name,
          kind,
          capacity: input.capacity ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "event_lodging_option.create",
          resourceType: "event_lodging_option",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { eventId, code, kind },
        },
      });
      return this.toResourceOptionDto(row);
    });
  }

  async listLodgingOptions(actor: AuthUser, eventId: string) {
    const { event } = await this.requireEventWrite(actor, eventId);
    const rows = await this.prisma.eventLodgingOption.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const occupied = await this.occupiedByResource(event.id, "lodgingOptionId");
    return {
      eventId: event.id,
      lodgingOptions: rows.map((r) =>
        this.toResourceOptionDto(r, occupied.get(r.id) ?? 0),
      ),
    };
  }

  async createMealOption(
    actor: AuthUser,
    eventId: string,
    input: MealOptionInput,
  ) {
    const { pilot, event } = await this.requireEventWrite(actor, eventId);
    const code = input.code?.trim().toLowerCase();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException("code e name são obrigatórios");
    }
    const kind = input.kind ?? "CUSTOM";
    if (!MEAL_KINDS.includes(kind)) {
      throw new BadRequestException("kind de alimentação inválido");
    }
    if (input.capacity != null && input.capacity < 1) {
      throw new BadRequestException("capacity inválida");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.eventMealOption.create({
        data: {
          eventId: event.id,
          code,
          name,
          kind,
          capacity: input.capacity ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "event_meal_option.create",
          resourceType: "event_meal_option",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { eventId, code, kind },
        },
      });
      return this.toResourceOptionDto(row);
    });
  }

  async listMealOptions(actor: AuthUser, eventId: string) {
    const { event } = await this.requireEventWrite(actor, eventId);
    const rows = await this.prisma.eventMealOption.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const occupied = await this.occupiedByResource(event.id, "mealOptionId");
    return {
      eventId: event.id,
      mealOptions: rows.map((r) =>
        this.toResourceOptionDto(r, occupied.get(r.id) ?? 0),
      ),
    };
  }

  async createTransportOption(
    actor: AuthUser,
    eventId: string,
    input: TransportOptionInput,
  ) {
    const { pilot, event } = await this.requireEventWrite(actor, eventId);
    const code = input.code?.trim().toLowerCase();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException("code e name são obrigatórios");
    }
    const kind = input.kind ?? "CUSTOM";
    if (!TRANSPORT_KINDS.includes(kind)) {
      throw new BadRequestException("kind de transporte inválido");
    }
    if (input.capacity != null && input.capacity < 1) {
      throw new BadRequestException("capacity inválida");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.eventTransportOption.create({
        data: {
          eventId: event.id,
          code,
          name,
          kind,
          capacity: input.capacity ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "event_transport_option.create",
          resourceType: "event_transport_option",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { eventId, code, kind },
        },
      });
      return this.toResourceOptionDto(row);
    });
  }

  async listTransportOptions(actor: AuthUser, eventId: string) {
    const { event } = await this.requireEventWrite(actor, eventId);
    const rows = await this.prisma.eventTransportOption.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const occupied = await this.occupiedByResource(
      event.id,
      "transportOptionId",
    );
    return {
      eventId: event.id,
      transportOptions: rows.map((r) =>
        this.toResourceOptionDto(r, occupied.get(r.id) ?? 0),
      ),
    };
  }

  /**
   * Staff autoriza / revoga autorização formal de responsável (menores).
   * Idempotente se já AUTHORIZED / REVOKED com o mesmo status alvo.
   */
  async setGuardianAuthorization(
    actor: AuthUser,
    registrationId: string,
    input: { status?: "AUTHORIZED" | "REVOKED"; acknowledgmentText?: string },
  ) {
    const { pilot, registration, event } =
      await this.requireRegistrationWrite(actor, registrationId);
    if (!registration.isMinor) {
      throw new BadRequestException(
        "Autorização de responsável só se aplica a menores",
      );
    }
    const next = input.status;
    if (next !== "AUTHORIZED" && next !== "REVOKED") {
      throw new BadRequestException("status deve ser AUTHORIZED ou REVOKED");
    }
    if (registration.status === "CANCELLED") {
      throw new BadRequestException("Inscrição cancelada");
    }

    return this.prisma.$transaction(async (tx) => {
      let auth = await tx.eventGuardianAuthorization.findUnique({
        where: { registrationId: registration.id },
      });
      const ack =
        input.acknowledgmentText?.trim() ||
        auth?.acknowledgmentText ||
        DEFAULT_GUARDIAN_ACK;
      if (!auth) {
        auth = await tx.eventGuardianAuthorization.create({
          data: {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            registrationId: registration.id,
            guardianDisplayName:
              registration.guardianDisplayName || "Responsável sintético",
            status: "PENDING",
            acknowledgmentText: ack,
          },
        });
      }

      if (auth.status === next) {
        const current = await tx.eventRegistration.findUniqueOrThrow({
          where: { id: registration.id },
        });
        return {
          ...this.toRegistrationDto(current),
          guardianAuthorization: this.toGuardianAuthDto(auth),
        };
      }

      const updatedAuth = await tx.eventGuardianAuthorization.update({
        where: { id: auth.id },
        data: {
          status: next,
          acknowledgmentText: ack,
          authorizedAt: next === "AUTHORIZED" ? new Date() : auth.authorizedAt,
          authorizedByUserId:
            next === "AUTHORIZED" ? actor.userId : auth.authorizedByUserId,
          revokedAt: next === "REVOKED" ? new Date() : null,
        },
      });
      const updatedReg = await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          guardianAuthStatus: next,
          guardianAuthorizedAt:
            next === "AUTHORIZED" ? new Date() : registration.guardianAuthorizedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action:
            next === "AUTHORIZED"
              ? "event_guardian_authorization.authorize"
              : "event_guardian_authorization.revoke",
          resourceType: "event_guardian_authorization",
          resourceId: updatedAuth.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { eventId: event.id, registrationId: registration.id },
        },
      });
      return {
        ...this.toRegistrationDto(updatedReg),
        guardianAuthorization: this.toGuardianAuthDto(updatedAuth),
      };
    });
  }

  async listRegistrations(actor: AuthUser, eventId: string) {
    const { pilot, event } = await this.requireEventWrite(actor, eventId);
    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        eventId: event.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    // Filter by ministry scope using the parent event's ministryId via a synthetic row.
    const scoped = filterRowsForMinistryLeader(
      rows.map((r) => ({ ...r, ministryId: event.ministryId })),
      actor,
      pilot,
    );
    return {
      eventId: event.id,
      registrations: scoped.map((r) => this.toRegistrationDto(r)),
    };
  }

  async createStaffRegistration(
    actor: AuthUser,
    eventId: string,
    input: RegistrationInput,
  ) {
    const { pilot, event } = await this.requireEventWrite(actor, eventId);
    if (event.status !== "PUBLISHED" && event.status !== "DRAFT") {
      throw new BadRequestException("Evento não aceita inscrição neste status");
    }
    return this.createRegistrationInternal({
      pilot,
      event,
      input,
      actorUserId: actor.userId,
      source: "staff",
    });
  }

  /**
   * Público — sem PII real: só rótulos sintéticos + modalidade/lote.
   * Rejeita cpf/email/telefone/documento.
   */
  async createPublicRegistration(eventSlug: string, input: RegistrationInput) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertNoRealPii(input as object);
    const event = await this.prisma.portalEvent.findFirst({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        slug: eventSlug.trim().toLowerCase(),
        status: "PUBLISHED",
      },
    });
    if (!event) {
      throw new NotFoundException("Evento público não encontrado");
    }
    return this.createRegistrationInternal({
      pilot,
      event,
      input,
      actorUserId: null,
      source: "public",
    });
  }

  async getPublicRegistrationStatus(checkInCode: string) {
    const pilot = await this.pilot.getPilotChurch();
    const code = checkInCode?.trim();
    if (!code || code.length < 8) {
      throw new BadRequestException("checkInCode inválido");
    }
    const row = await this.prisma.eventRegistration.findFirst({
      where: {
        checkInCode: code,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      include: { event: true },
    });
    if (!row) {
      throw new NotFoundException("Inscrição não encontrada");
    }
    return {
      id: row.id,
      eventSlug: row.event.slug,
      eventName: row.event.name,
      status: row.status,
      paymentStatus: row.paymentStatus,
      partySize: row.partySize,
      isMinor: row.isMinor,
      guardianAuthStatus: row.guardianAuthStatus,
      lodgingOptionId: row.lodgingOptionId,
      mealOptionId: row.mealOptionId,
      transportOptionId: row.transportOptionId,
      // sem displayName/guardian no status público — só operacional
      checkInCode: row.checkInCode,
    };
  }

  async checkIn(actor: AuthUser, registrationId: string, checkInCode?: string) {
    const { pilot, registration, event } =
      await this.requireRegistrationWrite(actor, registrationId);
    if (registration.status === "CANCELLED") {
      throw new BadRequestException("Inscrição cancelada");
    }
    if (registration.status === "CHECKED_IN") {
      return this.toRegistrationDto(registration);
    }
    if (registration.status === "PENDING_PAYMENT") {
      throw new BadRequestException("Pagamento pendente — check-in bloqueado");
    }
    if (
      registration.isMinor &&
      registration.guardianAuthStatus !== "AUTHORIZED"
    ) {
      throw new BadRequestException(
        "Autorização de responsável pendente — check-in bloqueado",
      );
    }
    if (checkInCode && checkInCode.trim() !== registration.checkInCode) {
      throw new BadRequestException("checkInCode não confere");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          status: "CHECKED_IN",
          checkedInAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "event_registration.check_in",
          resourceType: "event_registration",
          resourceId: registration.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { eventId: event.id },
        },
      });
      return this.toRegistrationDto(updated);
    });
  }

  async cancel(actor: AuthUser, registrationId: string) {
    const { pilot, registration, event } =
      await this.requireRegistrationWrite(actor, registrationId);
    if (registration.status === "CANCELLED") {
      return this.toRegistrationDto(registration);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          status: "CANCELLED",
          paymentStatus:
            registration.paymentStatus === "PENDING"
              ? "CANCELLED"
              : registration.paymentStatus,
          cancelledAt: new Date(),
        },
      });
      await tx.eventPaymentIntent.updateMany({
        where: {
          registrationId: registration.id,
          status: "PENDING",
        },
        data: { status: "CANCELLED" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "event_registration.cancel",
          resourceType: "event_registration",
          resourceId: registration.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { eventId: event.id },
        },
      });
      return this.toRegistrationDto(updated);
    });
  }

  /**
   * Webhook mock assinado + Idempotency-Key.
   * Assinatura: hex(HMAC-SHA256(secret, `${idempotencyKey}:${paymentIntentId}:${status}`)).
   * Status aceitos: CONFIRMED_MOCK | FAILED_MOCK. Sem gateway live.
   */
  async handleMockPaymentWebhook(params: {
    signatureHeader: string | undefined;
    idempotencyKey: string | undefined;
    paymentIntentId: string;
    status: "CONFIRMED_MOCK" | "FAILED_MOCK";
    providerRef?: string | null;
  }) {
    const idempotencyKey = params.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw new BadRequestException("Idempotency-Key obrigatória");
    }
    if (!["CONFIRMED_MOCK", "FAILED_MOCK"].includes(params.status)) {
      throw new BadRequestException("status mock inválido");
    }
    const secret = webhookSecret();
    if (!params.signatureHeader) {
      throw new UnauthorizedException("Assinatura ausente");
    }
    const canonical = `${idempotencyKey}:${params.paymentIntentId}:${params.status}`;
    const expected = createHmac("sha256", secret).update(canonical).digest("hex");
    if (!signaturesMatch(params.signatureHeader, expected)) {
      throw new UnauthorizedException("Assinatura inválida");
    }

    const existing = await this.prisma.eventPaymentWebhookReceipt.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      const intent = await this.prisma.eventPaymentIntent.findUnique({
        where: { id: existing.paymentIntentId },
        include: { registration: true },
      });
      return {
        idempotentReplay: true,
        paymentIntentId: existing.paymentIntentId,
        resultStatus: existing.resultStatus,
        registration: intent
          ? this.toRegistrationDto(intent.registration)
          : null,
      };
    }

    const intent = await this.prisma.eventPaymentIntent.findFirst({
      where: { id: params.paymentIntentId },
      include: { registration: true },
    });
    if (!intent) {
      throw new NotFoundException("PaymentIntent não encontrado");
    }

    const payloadHash = createHash("sha256").update(canonical).digest("hex");

    return this.prisma.$transaction(async (tx) => {
      // Re-check idempotency inside tx
      const raced = await tx.eventPaymentWebhookReceipt.findUnique({
        where: { idempotencyKey },
      });
      if (raced) {
        return {
          idempotentReplay: true,
          paymentIntentId: raced.paymentIntentId,
          resultStatus: raced.resultStatus,
          registration: this.toRegistrationDto(intent.registration),
        };
      }

      let registration = intent.registration;
      if (intent.status === "PENDING" && registration.status !== "CANCELLED") {
        const nextPayment = params.status;
        const nextRegStatus =
          params.status === "CONFIRMED_MOCK" ? "CONFIRMED" : "PENDING_PAYMENT";
        await tx.eventPaymentIntent.update({
          where: { id: intent.id },
          data: {
            status: nextPayment,
            providerRef: params.providerRef?.trim() || intent.providerRef,
            confirmedAt:
              params.status === "CONFIRMED_MOCK" ? new Date() : null,
          },
        });
        registration = await tx.eventRegistration.update({
          where: { id: registration.id },
          data: {
            paymentStatus: nextPayment,
            status:
              params.status === "CONFIRMED_MOCK"
                ? nextRegStatus
                : registration.status,
          },
        });
      }

      await tx.eventPaymentWebhookReceipt.create({
        data: {
          organizationId: intent.organizationId,
          churchId: intent.churchId,
          paymentIntentId: intent.id,
          idempotencyKey,
          eventType: `payment.${params.status.toLowerCase()}`,
          payloadHash,
          resultStatus: params.status,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: "event_payment.webhook_mock",
          resourceType: "event_payment_intent",
          resourceId: intent.id,
          organizationId: intent.organizationId,
          churchId: intent.churchId,
          metadata: {
            status: params.status,
            idempotent: false,
            registrationId: registration.id,
          },
        },
      });

      return {
        idempotentReplay: false,
        paymentIntentId: intent.id,
        resultStatus: params.status,
        registration: this.toRegistrationDto(registration),
      };
    });
  }

  /** Catálogo público (modalidades + lotes OPEN + RF-022 opções) — sem PII. */
  async publicCatalogForEvent(eventId: string) {
    const [
      modalities,
      lots,
      lodgingOptions,
      mealOptions,
      transportOptions,
      occMod,
      occLot,
      occLodging,
      occMeal,
      occTransport,
    ] = await Promise.all([
      this.prisma.eventModality.findMany({
        where: { eventId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
      this.prisma.eventLot.findMany({
        where: { eventId, status: "OPEN" },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
      this.prisma.eventLodgingOption.findMany({
        where: { eventId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
      this.prisma.eventMealOption.findMany({
        where: { eventId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
      this.prisma.eventTransportOption.findMany({
        where: { eventId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
      this.occupiedByModality(eventId),
      this.occupiedByLot(eventId),
      this.occupiedByResource(eventId, "lodgingOptionId"),
      this.occupiedByResource(eventId, "mealOptionId"),
      this.occupiedByResource(eventId, "transportOptionId"),
    ]);
    const now = Date.now();
    const openLots = lots.filter((lot) => {
      if (lot.opensAt && lot.opensAt.getTime() > now) return false;
      if (lot.closesAt && lot.closesAt.getTime() < now) return false;
      return true;
    });
    return {
      modalities: modalities.map((m) =>
        this.toModalityDto(m, occMod.get(m.id) ?? 0),
      ),
      lots: openLots.map((l) => this.toLotDto(l, occLot.get(l.id) ?? 0)),
      lodgingOptions: lodgingOptions.map((o) =>
        this.toResourceOptionDto(o, occLodging.get(o.id) ?? 0),
      ),
      mealOptions: mealOptions.map((o) =>
        this.toResourceOptionDto(o, occMeal.get(o.id) ?? 0),
      ),
      transportOptions: transportOptions.map((o) =>
        this.toResourceOptionDto(o, occTransport.get(o.id) ?? 0),
      ),
      paymentMode: "MOCK_ONLY" as const,
      /** RF-022 entregue nesta fatia — opções podem estar vazias se staff não configurou. */
      rf022LodgingPending: false,
      requiresLodgingOption: lodgingOptions.length > 0,
      requiresMealOption: mealOptions.length > 0,
      requiresTransportOption: transportOptions.length > 0,
      requiresGuardianAuthorizationForMinors: true,
    };
  }

  private async createRegistrationInternal(params: {
    pilot: { organizationId: string; churchId: string };
    event: {
      id: string;
      ministryId: string | null;
      status: string;
    };
    input: RegistrationInput;
    actorUserId: string | null;
    source: "staff" | "public";
  }) {
    const displayName = params.input.displayName?.trim();
    if (!displayName || displayName.length < 2 || displayName.length > 120) {
      throw new BadRequestException("displayName inválido");
    }
    const modalityId = params.input.modalityId?.trim();
    if (!modalityId) {
      throw new BadRequestException("modalityId é obrigatório");
    }
    const modality = await this.prisma.eventModality.findFirst({
      where: { id: modalityId, eventId: params.event.id },
    });
    if (!modality) {
      throw new BadRequestException("modalidade inválida");
    }

    const isMinor = Boolean(params.input.isMinor);
    const guardianDisplayName = params.input.guardianDisplayName?.trim() || null;
    if (isMinor && (!guardianDisplayName || guardianDisplayName.length < 2)) {
      throw new BadRequestException(
        "guardianDisplayName obrigatório quando isMinor=true",
      );
    }
    if (!isMinor && guardianDisplayName) {
      throw new BadRequestException(
        "guardianDisplayName só é permitido para menores",
      );
    }
    if (isMinor && params.input.guardianAcknowledged !== true) {
      throw new BadRequestException(
        "guardianAcknowledged=true obrigatório quando isMinor=true",
      );
    }
    if (!isMinor && params.input.guardianAcknowledged === true) {
      throw new BadRequestException(
        "guardianAcknowledged só é permitido para menores",
      );
    }

    const partySize = params.input.partySize ?? modality.minPartySize;
    if (
      partySize < modality.minPartySize ||
      partySize > modality.maxPartySize
    ) {
      throw new BadRequestException(
        `partySize deve estar entre ${modality.minPartySize} e ${modality.maxPartySize}`,
      );
    }

    let lot: {
      id: string;
      status: string;
      priceCents: number;
      currency: string;
      capacity: number | null;
      modalityId: string | null;
      opensAt: Date | null;
      closesAt: Date | null;
    } | null = null;
    const lotId = params.input.lotId?.trim() || null;
    if (lotId) {
      lot = await this.prisma.eventLot.findFirst({
        where: { id: lotId, eventId: params.event.id },
      });
      if (!lot) {
        throw new BadRequestException("lote inválido");
      }
      if (lot.modalityId && lot.modalityId !== modality.id) {
        throw new BadRequestException("lote não pertence à modalidade");
      }
      if (params.source === "public" && lot.status !== "OPEN") {
        throw new BadRequestException("lote indisponível");
      }
      if (lot.status === "CLOSED") {
        throw new BadRequestException("lote fechado");
      }
      const now = Date.now();
      if (lot.opensAt && lot.opensAt.getTime() > now) {
        throw new BadRequestException("lote ainda não abriu");
      }
      if (lot.closesAt && lot.closesAt.getTime() < now) {
        throw new BadRequestException("lote encerrado");
      }
    } else if (params.source === "public") {
      throw new BadRequestException("lotId é obrigatório na inscrição pública");
    }

    const [lodgingCatalog, mealCatalog, transportCatalog] = await Promise.all([
      this.prisma.eventLodgingOption.findMany({
        where: { eventId: params.event.id },
      }),
      this.prisma.eventMealOption.findMany({
        where: { eventId: params.event.id },
      }),
      this.prisma.eventTransportOption.findMany({
        where: { eventId: params.event.id },
      }),
    ]);

    const lodging = await this.resolveResourceOption({
      catalog: lodgingCatalog,
      optionId: params.input.lodgingOptionId,
      label: "hospedagem",
      required: lodgingCatalog.length > 0,
    });
    const meal = await this.resolveResourceOption({
      catalog: mealCatalog,
      optionId: params.input.mealOptionId,
      label: "alimentação",
      required: mealCatalog.length > 0,
    });
    const transport = await this.resolveResourceOption({
      catalog: transportCatalog,
      optionId: params.input.transportOptionId,
      label: "transporte",
      required: transportCatalog.length > 0,
    });

    const occMod = await this.countOccupied(params.event.id, {
      modalityId: modality.id,
    });
    if (modality.capacity != null && occMod + partySize > modality.capacity) {
      throw new BadRequestException("capacidade da modalidade esgotada");
    }
    if (lot?.capacity != null) {
      const occLot = await this.countOccupied(params.event.id, {
        lotId: lot.id,
      });
      if (occLot + partySize > lot.capacity) {
        throw new BadRequestException("capacidade do lote esgotada");
      }
    }
    await this.assertResourceCapacity(
      params.event.id,
      "lodgingOptionId",
      lodging,
      partySize,
    );
    await this.assertResourceCapacity(
      params.event.id,
      "mealOptionId",
      meal,
      partySize,
    );
    await this.assertResourceCapacity(
      params.event.id,
      "transportOptionId",
      transport,
      partySize,
    );

    const priceCents = lot?.priceCents ?? 0;
    const needsPayment = priceCents > 0;
    const checkInCode = randomBytes(16).toString("hex");
    const guardianAuthStatus = isMinor ? "PENDING" : "NOT_REQUIRED";

    return this.prisma.$transaction(async (tx) => {
      // Re-validate capacity inside transaction (best-effort).
      const occModTx = await tx.eventRegistration.aggregate({
        where: {
          eventId: params.event.id,
          modalityId: modality.id,
          status: { in: [...OCCUPYING_STATUSES] },
        },
        _sum: { partySize: true },
      });
      const usedMod = occModTx._sum.partySize ?? 0;
      if (modality.capacity != null && usedMod + partySize > modality.capacity) {
        throw new BadRequestException("capacidade da modalidade esgotada");
      }
      if (lot?.capacity != null) {
        const occLotTx = await tx.eventRegistration.aggregate({
          where: {
            eventId: params.event.id,
            lotId: lot.id,
            status: { in: [...OCCUPYING_STATUSES] },
          },
          _sum: { partySize: true },
        });
        const usedLot = occLotTx._sum.partySize ?? 0;
        if (usedLot + partySize > lot.capacity) {
          throw new BadRequestException("capacidade do lote esgotada");
        }
      }
      await this.assertResourceCapacityTx(
        tx,
        params.event.id,
        "lodgingOptionId",
        lodging,
        partySize,
      );
      await this.assertResourceCapacityTx(
        tx,
        params.event.id,
        "mealOptionId",
        meal,
        partySize,
      );
      await this.assertResourceCapacityTx(
        tx,
        params.event.id,
        "transportOptionId",
        transport,
        partySize,
      );

      const registration = await tx.eventRegistration.create({
        data: {
          organizationId: params.pilot.organizationId,
          churchId: params.pilot.churchId,
          eventId: params.event.id,
          modalityId: modality.id,
          lotId: lot?.id ?? null,
          lodgingOptionId: lodging?.id ?? null,
          mealOptionId: meal?.id ?? null,
          transportOptionId: transport?.id ?? null,
          displayName,
          partySize,
          isMinor,
          guardianDisplayName,
          guardianAuthStatus,
          status: needsPayment ? "PENDING_PAYMENT" : "CONFIRMED",
          paymentStatus: needsPayment ? "PENDING" : "CONFIRMED_MOCK",
          checkInCode,
        },
      });

      let guardianAuthorization: {
        id: string;
        status: string;
        acknowledgmentText: string;
        authorizedAt: Date | null;
        revokedAt: Date | null;
        guardianDisplayName: string;
        createdAt: Date;
        updatedAt: Date;
      } | null = null;
      if (isMinor && guardianDisplayName) {
        guardianAuthorization = await tx.eventGuardianAuthorization.create({
          data: {
            organizationId: params.pilot.organizationId,
            churchId: params.pilot.churchId,
            registrationId: registration.id,
            guardianDisplayName,
            status: "PENDING",
            acknowledgmentText: DEFAULT_GUARDIAN_ACK,
          },
        });
      }

      let paymentIntent: { id: string; status: string; amountCents: number } | null =
        null;
      if (needsPayment && lot) {
        paymentIntent = await tx.eventPaymentIntent.create({
          data: {
            organizationId: params.pilot.organizationId,
            churchId: params.pilot.churchId,
            eventId: params.event.id,
            registrationId: registration.id,
            lotId: lot.id,
            amountCents: priceCents,
            currency: lot.currency,
            status: "PENDING",
            providerRef: `mock_${randomBytes(8).toString("hex")}`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: params.actorUserId,
          action:
            params.source === "public"
              ? "event_registration.create_public"
              : "event_registration.create_staff",
          resourceType: "event_registration",
          resourceId: registration.id,
          organizationId: params.pilot.organizationId,
          churchId: params.pilot.churchId,
          metadata: {
            eventId: params.event.id,
            modalityId: modality.id,
            lotId: lot?.id ?? null,
            lodgingOptionId: lodging?.id ?? null,
            mealOptionId: meal?.id ?? null,
            transportOptionId: transport?.id ?? null,
            isMinor,
            guardianAuthStatus,
            needsPayment,
            // sem displayName em audit metadata pública
          },
        },
      });

      return {
        ...this.toRegistrationDto(registration),
        guardianAuthorization: guardianAuthorization
          ? this.toGuardianAuthDto(guardianAuthorization)
          : null,
        paymentIntent: paymentIntent
          ? {
              id: paymentIntent.id,
              status: paymentIntent.status,
              amountCents: paymentIntent.amountCents,
              mode: "MOCK_ONLY" as const,
            }
          : null,
      };
    });
  }

  private assertNoRealPii(input: object): void {
    const forbidden = [
      "cpf",
      "document",
      "birthDate",
      "email",
      "phone",
      "phoneHome",
      "address",
      "rg",
      "passport",
    ];
    const hit = Object.keys(input).filter((k) => forbidden.includes(k));
    if (hit.length) {
      throw new BadRequestException(
        "Campos de PII real não permitidos na inscrição pública",
      );
    }
  }

  private async countOccupied(
    eventId: string,
    filter: { modalityId?: string; lotId?: string },
  ): Promise<number> {
    const agg = await this.prisma.eventRegistration.aggregate({
      where: {
        eventId,
        status: { in: [...OCCUPYING_STATUSES] },
        ...(filter.modalityId ? { modalityId: filter.modalityId } : {}),
        ...(filter.lotId ? { lotId: filter.lotId } : {}),
      },
      _sum: { partySize: true },
    });
    return agg._sum.partySize ?? 0;
  }

  private async occupiedByModality(eventId: string) {
    const rows = await this.prisma.eventRegistration.groupBy({
      by: ["modalityId"],
      where: {
        eventId,
        status: { in: [...OCCUPYING_STATUSES] },
      },
      _sum: { partySize: true },
    });
    return new Map(rows.map((r) => [r.modalityId, r._sum.partySize ?? 0]));
  }

  private async occupiedByLot(eventId: string) {
    const rows = await this.prisma.eventRegistration.groupBy({
      by: ["lotId"],
      where: {
        eventId,
        status: { in: [...OCCUPYING_STATUSES] },
        lotId: { not: null },
      },
      _sum: { partySize: true },
    });
    return new Map(
      rows
        .filter((r) => r.lotId)
        .map((r) => [r.lotId as string, r._sum.partySize ?? 0]),
    );
  }

  private async occupiedByResource(
    eventId: string,
    field: "lodgingOptionId" | "mealOptionId" | "transportOptionId",
  ) {
    const rows = await this.prisma.eventRegistration.groupBy({
      by: [field],
      where: {
        eventId,
        status: { in: [...OCCUPYING_STATUSES] },
        [field]: { not: null },
      },
      _sum: { partySize: true },
    });
    return new Map(
      rows
        .filter((r) => r[field])
        .map((r) => [r[field] as string, r._sum.partySize ?? 0]),
    );
  }

  private async resolveResourceOption(params: {
    catalog: Array<{ id: string; capacity: number | null }>;
    optionId?: string | null;
    label: string;
    required: boolean;
  }): Promise<{ id: string; capacity: number | null } | null> {
    const optionId = params.optionId?.trim() || null;
    if (!optionId) {
      if (params.required) {
        throw new BadRequestException(
          `Opção de ${params.label} é obrigatória neste evento`,
        );
      }
      return null;
    }
    const found = params.catalog.find((o) => o.id === optionId);
    if (!found) {
      throw new BadRequestException(`Opção de ${params.label} inválida`);
    }
    return found;
  }

  private async assertResourceCapacity(
    eventId: string,
    field: "lodgingOptionId" | "mealOptionId" | "transportOptionId",
    option: { id: string; capacity: number | null } | null,
    partySize: number,
  ) {
    if (!option?.capacity) return;
    const occupied = await this.countOccupiedResource(eventId, field, option.id);
    if (occupied + partySize > option.capacity) {
      throw new BadRequestException(
        `capacidade de ${resourceLabel(field)} esgotada`,
      );
    }
  }

  private async assertResourceCapacityTx(
    // Prisma interactive transaction client — keep loose to avoid Omit<> friction.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    eventId: string,
    field: "lodgingOptionId" | "mealOptionId" | "transportOptionId",
    option: { id: string; capacity: number | null } | null,
    partySize: number,
  ) {
    if (!option?.capacity) return;
    const agg = await tx.eventRegistration.aggregate({
      where: {
        eventId,
        status: { in: [...OCCUPYING_STATUSES] },
        [field]: option.id,
      },
      _sum: { partySize: true },
    });
    const used = (agg._sum.partySize as number | null) ?? 0;
    if (used + partySize > option.capacity) {
      throw new BadRequestException(
        `capacidade de ${resourceLabel(field)} esgotada`,
      );
    }
  }

  private async countOccupiedResource(
    eventId: string,
    field: "lodgingOptionId" | "mealOptionId" | "transportOptionId",
    optionId: string,
  ): Promise<number> {
    const agg = await this.prisma.eventRegistration.aggregate({
      where: {
        eventId,
        status: { in: [...OCCUPYING_STATUSES] },
        [field]: optionId,
      },
      _sum: { partySize: true },
    });
    return agg._sum.partySize ?? 0;
  }

  private async requireEventWrite(actor: AuthUser, eventId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const event = await this.prisma.portalEvent.findFirst({
      where: {
        id: eventId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!event) {
      throw new NotFoundException("Evento não encontrado");
    }
    assertMinistryScopedWrite(actor, pilot, event.ministryId, {
      missingMinistry: "Líder precisa de ministryId no evento",
      forbidden: "Sem permissão neste ministério/evento",
    });
    return { pilot, event };
  }

  private async requireRegistrationWrite(
    actor: AuthUser,
    registrationId: string,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const registration = await this.prisma.eventRegistration.findFirst({
      where: {
        id: registrationId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!registration) {
      throw new NotFoundException("Inscrição não encontrada");
    }
    const event = await this.prisma.portalEvent.findFirst({
      where: { id: registration.eventId },
    });
    if (!event) {
      throw new NotFoundException("Evento não encontrado");
    }
    assertMinistryScopedWrite(actor, pilot, event.ministryId, {
      missingMinistry: "Líder precisa de ministryId no evento",
      forbidden: "Sem permissão nesta inscrição",
    });
    return { pilot, registration, event };
  }

  private toModalityDto(
    row: {
      id: string;
      eventId: string;
      code: string;
      name: string;
      kind: string;
      capacity: number | null;
      minPartySize: number;
      maxPartySize: number;
      sortOrder: number;
    },
    occupied = 0,
  ) {
    return {
      id: row.id,
      eventId: row.eventId,
      code: row.code,
      name: row.name,
      kind: row.kind,
      capacity: row.capacity,
      occupied,
      remaining:
        row.capacity == null ? null : Math.max(0, row.capacity - occupied),
      minPartySize: row.minPartySize,
      maxPartySize: row.maxPartySize,
      sortOrder: row.sortOrder,
    };
  }

  private toLotDto(
    row: {
      id: string;
      eventId: string;
      modalityId: string | null;
      code: string;
      name: string;
      capacity: number | null;
      priceCents: number;
      currency: string;
      opensAt: Date | null;
      closesAt: Date | null;
      status: string;
      sortOrder: number;
    },
    occupied = 0,
  ) {
    return {
      id: row.id,
      eventId: row.eventId,
      modalityId: row.modalityId,
      code: row.code,
      name: row.name,
      capacity: row.capacity,
      occupied,
      remaining:
        row.capacity == null ? null : Math.max(0, row.capacity - occupied),
      priceCents: row.priceCents,
      currency: row.currency,
      opensAt: row.opensAt?.toISOString() ?? null,
      closesAt: row.closesAt?.toISOString() ?? null,
      status: row.status,
      sortOrder: row.sortOrder,
      paymentMode: "MOCK_ONLY" as const,
    };
  }

  private toResourceOptionDto(
    row: {
      id: string;
      eventId: string;
      code: string;
      name: string;
      kind: string;
      capacity: number | null;
      sortOrder: number;
    },
    occupied = 0,
  ) {
    return {
      id: row.id,
      eventId: row.eventId,
      code: row.code,
      name: row.name,
      kind: row.kind,
      capacity: row.capacity,
      occupied,
      remaining:
        row.capacity == null ? null : Math.max(0, row.capacity - occupied),
      sortOrder: row.sortOrder,
    };
  }

  private toGuardianAuthDto(row: {
    id: string;
    status: string;
    acknowledgmentText: string;
    authorizedAt: Date | null;
    revokedAt: Date | null;
    guardianDisplayName: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      status: row.status,
      acknowledgmentText: row.acknowledgmentText,
      guardianDisplayName: row.guardianDisplayName,
      authorizedAt: row.authorizedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRegistrationDto(row: {
    id: string;
    eventId: string;
    modalityId: string;
    lotId: string | null;
    lodgingOptionId?: string | null;
    mealOptionId?: string | null;
    transportOptionId?: string | null;
    displayName: string;
    partySize: number;
    isMinor: boolean;
    guardianDisplayName: string | null;
    guardianAuthStatus?: string;
    guardianAuthorizedAt?: Date | null;
    status: string;
    paymentStatus: string;
    checkInCode: string;
    checkedInAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      eventId: row.eventId,
      modalityId: row.modalityId,
      lotId: row.lotId,
      lodgingOptionId: row.lodgingOptionId ?? null,
      mealOptionId: row.mealOptionId ?? null,
      transportOptionId: row.transportOptionId ?? null,
      displayName: row.displayName,
      partySize: row.partySize,
      isMinor: row.isMinor,
      guardianDisplayName: row.guardianDisplayName,
      guardianAuthStatus: row.guardianAuthStatus ?? "NOT_REQUIRED",
      guardianAuthorizedAt: row.guardianAuthorizedAt?.toISOString() ?? null,
      status: row.status,
      paymentStatus: row.paymentStatus,
      checkInCode: row.checkInCode,
      checkedInAt: row.checkedInAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      paymentMode: "MOCK_ONLY" as const,
    };
  }
}

function resourceLabel(
  field: "lodgingOptionId" | "mealOptionId" | "transportOptionId",
): string {
  if (field === "lodgingOptionId") return "hospedagem";
  if (field === "mealOptionId") return "alimentação";
  return "transporte";
}

function defaultMinParty(kind: string): number {
  if (kind === "COUPLE") return 2;
  if (kind === "FAMILY") return 2;
  return 1;
}

function defaultMaxParty(kind: string): number {
  if (kind === "COUPLE") return 2;
  if (kind === "FAMILY") return 8;
  return 1;
}

function parseDate(value: string, field: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${field} inválido`);
  }
  return d;
}

function webhookSecret(): string {
  const fromEnv = process.env.EVENT_PAYMENT_WEBHOOK_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // Segredo de demo apenas — nunca gateway live.
  return "event-payment-mock-dev-secret";
}

function signaturesMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.trim().toLowerCase(), "utf8");
    const bb = Buffer.from(b.trim().toLowerCase(), "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
