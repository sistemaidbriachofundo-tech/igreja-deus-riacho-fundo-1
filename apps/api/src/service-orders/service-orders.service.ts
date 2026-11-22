import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hasAccess, ROLE_CODES, type ServiceOrderDto } from "@idbrf/shared";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { renderServiceOrderPdf } from "./service-order-pdf";

const ITEM_LIMIT = 40;
const includeItems = {
  items: { orderBy: { position: "asc" as const } },
};

type OrderRow = {
  id: string;
  title: string;
  serviceAt: Date;
  notes: string | null;
  status: "DRAFT" | "APPROVED" | "PUBLISHED";
  updatedAt: Date;
  items: Array<{ id: string; position: number; title: string; minutes: number | null; responsible: string | null; responsiblePersonId?: string | null; microphone?: string | null; equipment?: string | null; notes?: string | null }>;
};

export interface ServiceOrderWriteInput {
  title: string;
  serviceAt: string;
  notes?: string | null;
  items: Array<{ title?: string; minutes?: number | null; responsible?: string | null; responsiblePersonId?: string | null; microphone?: string | null; equipment?: string | null; notes?: string | null }>;
  expectedUpdatedAt?: string;
}

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async list(actor: AuthUser) {
    const pilot = await this.scope(actor, "read");
    const rows = await this.prisma.serviceOrder.findMany({
      where: pilot,
      orderBy: [{ serviceAt: "asc" }, { id: "asc" }],
      include: includeItems,
    });
    return { orders: rows.map((row) => this.toDto(row)) };
  }

  async getById(actor: AuthUser, orderId: string) {
    const pilot = await this.scope(actor, "read");
    const row = await this.prisma.serviceOrder.findFirst({
      where: { ...pilot, id: orderId },
      include: includeItems,
    });
    if (!row) throw new NotFoundException("Ordem de culto não encontrada");
    return this.toDto(row);
  }

  async pdf(actor: AuthUser, orderId: string) {
    const order = await this.getById(actor, orderId);
    return renderServiceOrderPdf(order);
  }

  async create(actor: AuthUser, input: ServiceOrderWriteInput) {
    const pilot = await this.scope(actor, "write");
    const data = this.parseWrite(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM churches WHERE id = ${pilot.churchId} FOR UPDATE`;
        const duplicate = await tx.serviceOrder.findFirst({
          where: { churchId: pilot.churchId, serviceAt: data.serviceAt },
          select: { id: true },
        });
        if (duplicate) this.duplicate();
        const row = await tx.serviceOrder.create({
          data: {
            ...pilot,
            title: data.title,
            serviceAt: data.serviceAt,
            notes: data.notes,
            status: "DRAFT",
            createdByUserId: actor.userId,
            items: { create: data.items },
          },
          include: includeItems,
        });
        await this.audit(tx, actor, pilot, "service_order.create", row);
        return this.toDto(row);
      });
    } catch (error) {
      this.rethrowUnique(error);
      throw error;
    }
  }

  async update(actor: AuthUser, orderId: string, input: ServiceOrderWriteInput) {
    const pilot = await this.scope(actor, "write");
    const data = this.parseWrite(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.lock(tx, pilot, orderId, input.expectedUpdatedAt);
        if (current.status === "PUBLISHED") {
          throw new ConflictException({
            code: "SERVICE_ORDER_LOCKED",
            message: "A ordem publicada não pode ser alterada.",
          });
        }
        const duplicate = await tx.serviceOrder.findFirst({
          where: { churchId: pilot.churchId, serviceAt: data.serviceAt, NOT: { id: orderId } },
          select: { id: true },
        });
        if (duplicate) this.duplicate();
        const reopened = current.status === "APPROVED";
        const row = await tx.serviceOrder.update({
          where: { id: orderId },
          data: {
            title: data.title,
            serviceAt: data.serviceAt,
            notes: data.notes,
            status: "DRAFT",
            approvedByUserId: null,
            approvedAt: null,
            items: { deleteMany: {}, create: data.items },
          },
          include: includeItems,
        });
        await this.audit(tx, actor, pilot, "service_order.update", row, { reopened });
        return this.toDto(row);
      });
    } catch (error) {
      this.rethrowUnique(error);
      throw error;
    }
  }

  async approve(actor: AuthUser, orderId: string, expectedUpdatedAt?: string) {
    const pilot = await this.scope(actor, "write");
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, pilot, orderId, expectedUpdatedAt);
      if (current.status === "APPROVED" || current.status === "PUBLISHED") return this.toDto(current);
      const row = await tx.serviceOrder.update({
        where: { id: orderId },
        data: { status: "APPROVED", approvedByUserId: actor.userId, approvedAt: new Date() },
        include: includeItems,
      });
      await this.audit(tx, actor, pilot, "service_order.approve", row);
      return this.toDto(row);
    });
  }

  async publish(actor: AuthUser, orderId: string, expectedUpdatedAt?: string) {
    const pilot = await this.scope(actor, "write");
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, pilot, orderId, expectedUpdatedAt);
      if (current.status === "PUBLISHED") return this.toDto(current);
      if (current.status !== "APPROVED") {
        throw new ConflictException({
          code: "SERVICE_ORDER_STATE",
          message: "A publicação exige uma ordem aprovada.",
        });
      }
      const row = await tx.serviceOrder.update({
        where: { id: orderId },
        data: { status: "PUBLISHED", publishedByUserId: actor.userId, publishedAt: new Date() },
        include: includeItems,
      });
      await this.audit(tx, actor, pilot, "service_order.publish", row);
      return this.toDto(row);
    });
  }

  private async scope(actor: AuthUser, mode: "read" | "write") {
    const pilot = await this.pilot.getPilotChurch();
    const scope = { organizationId: pilot.organizationId, churchId: pilot.churchId };
    const roles = mode === "read"
      ? [ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN]
      : [ROLE_CODES.PASTOR];
    if ((actor.churchId && actor.churchId !== scope.churchId)
      || (actor.organizationId && actor.organizationId !== scope.organizationId)
      || !hasAccess(actor.grants, { ...scope, roleCodes: roles })) {
      throw new ForbiddenException(mode === "read"
        ? "Somente pastor e administrador da congregação consultam a ordem de culto."
        : "Somente o pastor da congregação edita, aprova e publica a ordem de culto.");
    }
    return scope;
  }

  private async lock(
    tx: Prisma.TransactionClient,
    pilot: { organizationId: string; churchId: string },
    orderId: string,
    expectedUpdatedAt?: string,
  ) {
    await tx.$executeRaw`SELECT id FROM service_orders WHERE id = ${orderId} AND church_id = ${pilot.churchId} FOR UPDATE`;
    const current = await tx.serviceOrder.findFirst({
      where: { ...pilot, id: orderId },
      include: includeItems,
    });
    if (!current) throw new NotFoundException("Ordem de culto não encontrada");
    if (expectedUpdatedAt && current.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw new ConflictException({
        code: "SERVICE_ORDER_STALE",
        message: "A ordem foi atualizada por outra gravação. Recarregue antes de continuar.",
      });
    }
    return current;
  }

  private parseWrite(input: ServiceOrderWriteInput) {
    const title = input.title?.trim() ?? "";
    if (!title || title.length > 160) throw new BadRequestException("Informe o título da ordem, com até 160 caracteres.");
    const serviceAt = this.parseServiceAt(input.serviceAt);
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (notes.length > 4000) throw new BadRequestException("O resumo da ordem é longo demais.");
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > ITEM_LIMIT) {
      throw new BadRequestException("A ordem precisa ter de 1 a 40 itens.");
    }
    const items = input.items.map((item, position) => {
      const itemTitle = item?.title?.trim() ?? "";
      if (!itemTitle || itemTitle.length > 160) throw new BadRequestException("Cada item precisa de um título.");
      let minutes: number | null = null;
      if (item.minutes !== undefined && item.minutes !== null) {
        if (!Number.isInteger(item.minutes) || item.minutes < 1 || item.minutes > 180) {
          throw new BadRequestException("Os minutos do item precisam ser um inteiro entre 1 e 180.");
        }
        minutes = item.minutes;
      }
      const responsible = item.responsible?.trim() ?? "";
      if (responsible.length > 80) throw new BadRequestException("O responsável do item é longo demais.");
      const optionalText = (value: string | null | undefined, max: number, label: string) => {
        const text = typeof value === "string" ? value.trim() : "";
        if (text.length > max) throw new BadRequestException(label + " muito longo.");
        return text || null;
      };
      return { position, title: itemTitle, minutes, responsible: responsible || null,
        responsiblePersonId: optionalText(item.responsiblePersonId, 80, "ID do responsável"),
        microphone: optionalText(item.microphone, 100, "Microfone"),
        equipment: optionalText(item.equipment, 280, "Equipamento"),
        notes: optionalText(item.notes, 700, "Orientações"),
      };
    });
    return { title, serviceAt, notes: notes || null, items };
  }

  private parseServiceAt(value: string) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      throw new BadRequestException("serviceAt precisa ser data e horário em ISO-8601.");
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("serviceAt inválido.");
    return date;
  }

  private duplicate(): never {
    throw new ConflictException({
      code: "SERVICE_ORDER_DUPLICATE",
      message: "Já existe uma ordem para este culto.",
    });
  }

  private rethrowUnique(error: unknown): void {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") this.duplicate();
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    action: string,
    row: OrderRow,
    extra: Record<string, unknown> = {},
  ) {
    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action,
        resourceType: "service_order",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { status: row.status, serviceAt: row.serviceAt.toISOString(), itemCount: row.items.length, ...extra },
      },
    });
  }

  private toDto(row: OrderRow): ServiceOrderDto {
    return {
      id: row.id,
      title: row.title,
      serviceAt: row.serviceAt.toISOString(),
      notes: row.notes,
      items: [...row.items].sort((left, right) => left.position - right.position).map((item) => ({
        id: item.id,
        position: item.position,
        title: item.title,
        minutes: item.minutes,
        responsible: item.responsible,
        responsiblePersonId: item.responsiblePersonId ?? null,
        microphone: item.microphone ?? null,
        equipment: item.equipment ?? null,
        notes: item.notes ?? null,
      })),
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
