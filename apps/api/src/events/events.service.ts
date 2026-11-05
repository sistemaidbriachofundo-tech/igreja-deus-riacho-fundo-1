import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canAdministerMinistries } from "@idbrf/shared";
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

    return {
      churchId: pilot.churchId,
      events: visible.map((row) => this.toDto(row)),
    };
  }

  async get(actor: AuthUser, eventId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const event = await this.requireEvent(eventId, pilot);
    this.assertEventWrite(actor, pilot, event.ministryId);
    return this.toDto(event);
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
      const event = await tx.portalEvent.update({
        where: { id: eventId },
        data,
      });
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
    });
  }

  async publish(actor: AuthUser, eventId: string) {
    return this.patch(actor, eventId, { status: "PUBLISHED" });
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
