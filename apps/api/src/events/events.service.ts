import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canAdministerMinistries, containsEmailAddress } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import {
  assertMinistryScopedWrite,
  filterRowsForMinistryLeader,
  requireMinistryInPilot,
} from "../common/ministry-access";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

export type EventInput = {
  name?: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  locationText?: string | null;
  ministryId?: string | null;
  featuredOnHome?: boolean;
  status?: "DRAFT" | "PUBLISHED" | "CANCELLED" | "ARCHIVED";
  ticketPolicy?: "REGISTRATION" | "PARTICIPANT";
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async create(actor: AuthUser, input: EventInput) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertEventWrite(actor, pilot, input.ministryId ?? null);

    const name = input.name?.trim();
    const slug = input.slug?.trim().toLowerCase();
    if (!name || !slug) {
      throw new BadRequestException("name e slug são obrigatórios");
    }
    if (!input.startsAt) {
      throw new BadRequestException("startsAt é obrigatório");
    }
    const startsAt = parseDate(input.startsAt, "startsAt");
    const endsAt =
      input.endsAt === undefined || input.endsAt === null
        ? null
        : parseDate(input.endsAt, "endsAt");

    if (input.ministryId) {
      await requireMinistryInPilot(this.prisma, input.ministryId, pilot);
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.portalEvent.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: input.ministryId ?? null,
          name,
          slug,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          startsAt,
          endsAt,
          locationText: input.locationText ?? null,
          featuredOnHome: Boolean(input.featuredOnHome),
          status: "DRAFT",
          createdByUserId: actor.userId,
          ...(input.ticketPolicy ? { ticketPolicy: input.ticketPolicy } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "portal_event.create",
          resourceType: "portal_event",
          resourceId: event.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { slug, name },
        },
      });
      return this.toDto(event);
    });
  }

  async list(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canAdministerMinistries(actor.grants, pilot) &&
      !actor.grants.some((g) => g.roleCode === "LIDER_MINISTERIO")
    ) {
      throw new ForbiddenException("Sem permissão para listar eventos");
    }

    const rows = await this.prisma.portalEvent.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { startsAt: "desc" },
    });

    const visible = filterRowsForMinistryLeader(rows, actor, pilot);
    const granted = await this.scannerIds(actor.userId, visible.map(row => row.id));

    return {
      churchId: pilot.churchId,
      events: visible.map((row) => this.toDto({ ...row, canScan: this.canScan(actor, row, granted.has(row.id)) })),
    };
  }

  async get(actor: AuthUser, eventId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const event = await this.requireEvent(eventId, pilot);
    this.assertEventWrite(actor, pilot, event.ministryId);
    const granted = await this.scannerIds(actor.userId, [event.id]);
    return this.toDto({ ...event, canScan: this.canScan(actor, event, granted.has(event.id)) });
  }

  async patch(actor: AuthUser, eventId: string, input: EventInput) {
    const pilot = await this.pilot.getPilotChurch();
    const existing = await this.requireEvent(eventId, pilot);
    this.assertEventWrite(actor, pilot, existing.ministryId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new BadRequestException("name inválido");
      data.name = name;
    }
    if (input.slug !== undefined) {
      const slug = input.slug?.trim().toLowerCase();
      if (!slug) throw new BadRequestException("slug inválido");
      data.slug = slug;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.locationText !== undefined) data.locationText = input.locationText;
    if (input.featuredOnHome !== undefined) {
      data.featuredOnHome = Boolean(input.featuredOnHome);
    }
    if (input.ticketPolicy !== undefined) {
      if (existing.status !== "DRAFT") {
        throw new BadRequestException("A política de ingresso só muda enquanto o evento é rascunho.");
      }
      if (input.ticketPolicy !== "REGISTRATION" && input.ticketPolicy !== "PARTICIPANT") {
        throw new BadRequestException("ticketPolicy inválida");
      }
      data.ticketPolicy = input.ticketPolicy;
    }
    if (input.startsAt !== undefined) {
      data.startsAt = parseDate(input.startsAt, "startsAt");
    }
    if (input.endsAt !== undefined) {
      data.endsAt =
        input.endsAt === null ? null : parseDate(input.endsAt, "endsAt");
    }
    if (input.ministryId !== undefined) {
      if (input.ministryId) {
        await requireMinistryInPilot(this.prisma, input.ministryId, pilot);
        this.assertEventWrite(actor, pilot, input.ministryId);
      }
      data.ministryId = input.ministryId;
    }
    if (input.status !== undefined) {
      this.applyStatus(data, input.status, existing.status);
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.ministryId !== undefined && input.ministryId !== existing.ministryId &&
          await tx.roster.findUnique({ where: { portalEventId: eventId }, select: { id: true } })) {
        throw new ConflictException("O ministério deste evento já tem uma escala vinculada.");
      }
      const event = await tx.portalEvent.update({
        where: { id: eventId },
        data,
      });
      if (input.status === "CANCELLED" || input.status === "ARCHIVED") {
        await tx.roster.updateMany({
          where: { portalEventId: eventId, status: { not: "CLOSED" } },
          data: { status: "CLOSED" },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "portal_event.patch",
          resourceType: "portal_event",
          resourceId: eventId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { fields: Object.keys(data) },
        },
      });
      return this.toDto(event);
    }, { isolationLevel: "Serializable" }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
        throw new ConflictException("O evento mudou. Atualize a tela e tente novamente.");
      }
      throw error;
    });
  }

  async publish(actor: AuthUser, eventId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const existing = await this.requireEvent(eventId, pilot);
    const blocked = eventPublicationBlockReason(existing);
    if (blocked) {
      throw new BadRequestException(blocked);
    }
    await this.assertReceivingAccountsActive(eventId);
    return this.patch(actor, eventId, { status: "PUBLISHED" });
  }

  /** Lote pago com conta da igreja só publica se essa conta continuar ativa. */
  private async assertReceivingAccountsActive(eventId: string): Promise<void> {
    if (!this.prisma.eventLot?.findMany) return;
    const lots = await this.prisma.eventLot.findMany({
      where: { eventId, priceCents: { gt: 0 }, receivingAccountId: { not: null } },
      select: { receivingAccountId: true },
    });
    const ids = [...new Set(lots.map((lot) => lot.receivingAccountId).filter((id): id is string => Boolean(id)))];
    if (!ids.length || !this.prisma.churchReceivingAccount?.findMany) return;
    const accounts = await this.prisma.churchReceivingAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, active: true },
    });
    if (accounts.length !== ids.length || accounts.some((account) => !account.active)) {
      throw new BadRequestException("A conta que recebe o evento pago não está ativa.");
    }
  }

  async cancel(actor: AuthUser, eventId: string) {
    return this.patch(actor, eventId, { status: "CANCELLED" });
  }

  async archive(actor: AuthUser, eventId: string) {
    return this.patch(actor, eventId, { status: "ARCHIVED" });
  }

  private applyStatus(
    data: Record<string, unknown>,
    next: "DRAFT" | "PUBLISHED" | "CANCELLED" | "ARCHIVED",
    current: string,
  ): void {
    if (!["DRAFT", "PUBLISHED", "CANCELLED", "ARCHIVED"].includes(next)) {
      throw new BadRequestException("status inválido");
    }
    data.status = next;
    if (next === "PUBLISHED" && current !== "PUBLISHED") {
      data.publishedAt = new Date();
      data.cancelledAt = null;
    }
    if (next === "CANCELLED" && current !== "CANCELLED") {
      data.cancelledAt = new Date();
    }
    if (next === "DRAFT") {
      data.publishedAt = null;
      data.cancelledAt = null;
    }
    if (next === "ARCHIVED") {
      data.featuredOnHome = false;
    }
  }

  private assertEventWrite(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    ministryId: string | null,
  ): void {
    assertMinistryScopedWrite(actor, pilot, ministryId, {
      missingMinistry: "Líder precisa vincular ministryId para operar eventos",
      forbidden: "Sem permissão neste ministério/evento",
    });
  }

  private async scannerIds(userId: string, eventIds: string[]) {
    if (!eventIds.length || !this.prisma.eventScannerGrant?.findMany) return new Set<string>();
    const rows = await this.prisma.eventScannerGrant.findMany({
      where: { userId, eventId: { in: eventIds } },
      select: { eventId: true },
    });
    return new Set(rows.map(row => row.eventId));
  }

  private canScan(actor: AuthUser, event: { createdByUserId?: string | null; ministryId?: string | null }, granted: boolean) {
    if (granted) return true;
    if (event.createdByUserId && event.createdByUserId === actor.userId) return true;
    return Boolean(event.ministryId) && actor.grants.some(grant =>
      grant.roleCode === "LIDER_MINISTERIO" && (!grant.ministryId || grant.ministryId === event.ministryId));
  }

  private async requireEvent(
    eventId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
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
    return event;
  }

  private toDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    ministryId: string | null;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    startsAt: Date;
    endsAt: Date | null;
    locationText: string | null;
    status: string;
    featuredOnHome: boolean;
    ticketPolicy?: string;
    createdByUserId?: string | null;
    canScan?: boolean;
    publishedAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      ministryId: row.ministryId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.imageUrl,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      locationText: row.locationText,
      status: row.status,
      featuredOnHome: row.featuredOnHome,
      ticketPolicy: row.ticketPolicy ?? "REGISTRATION",
      createdByUserId: row.createdByUserId ?? null,
      canScan: row.canScan ?? false,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function parseDate(value: string, field: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${field} inválido`);
  }
  return d;
}

const PERSONAL_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const PERSONAL_PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}-\d{4}/;

/** Bloqueia publicação na agenda quando o texto parece e-mail, telefone ou CPF. */
export function eventPublicationBlockReason(event: {
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  locationText?: string | null;
  imageUrl?: string | null;
}): string | null {
  const text = [
    event.name,
    event.slug,
    event.description,
    event.locationText,
    event.imageUrl,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
  if (
    containsEmailAddress(text) ||
    PERSONAL_CPF.test(text) ||
    PERSONAL_PHONE.test(text)
  ) {
    return "Publicação bloqueada: revise nome, descrição ou local. O texto parece conter e-mail, telefone ou CPF.";
  }
  return null;
}
