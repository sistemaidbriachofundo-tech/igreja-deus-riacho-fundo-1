import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canAccessPastoralCare } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
const CASE_KINDS = [
  "VISITA",
  "ORACAO",
  "ACOLHIMENTO",
  "ACOMPANHAMENTO",
  "OUTRO",
] as const;

type CaseStatus = (typeof CASE_STATUSES)[number];
type CaseKind = (typeof CASE_KINDS)[number];

@Injectable()
export class PastoralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async create(
    actor: AuthUser,
    input: {
      personId: string;
      kind: string;
      title: string;
      summary?: string;
      assignedToUserId?: string;
      dueAt?: string;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);

    const kind = this.requireKind(input.kind);
    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException("title é obrigatório");
    }
    if (!input.personId?.trim()) {
      throw new BadRequestException("personId é obrigatório");
    }

    const person = await this.prisma.person.findFirst({
      where: {
        id: input.personId,
        organizationId: pilot.organizationId,
      },
      select: { id: true },
    });
    if (!person) {
      throw new BadRequestException("Pessoa não encontrada neste escopo");
    }

    if (input.assignedToUserId) {
      await this.requireUser(input.assignedToUserId);
    }

    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException("dueAt inválido");
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.pastoralCase.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          personId: person.id,
          kind,
          title,
          summary: input.summary?.trim() || null,
          assignedToUserId: input.assignedToUserId ?? null,
          createdByUserId: actor.userId,
          dueAt,
        },
        include: { tasks: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "pastoral.case.create",
          resourceType: "pastoral_case",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { personId: person.id, kind },
        },
      });

      return this.toCaseDto(row);
    });
  }

  async list(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);

    const rows = await this.prisma.pastoralCase.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { createdAt: "desc" },
      include: { tasks: { orderBy: { createdAt: "asc" } } },
    });

    return {
      churchId: pilot.churchId,
      cases: rows.map((row) => this.toCaseDto(row)),
    };
  }

  /**
   * RF-009 — política de retenção (default 2555 dias ≈ 7 anos).
   * Só PASTOR (assertPastoralAccess).
   */
  async getRetentionPolicy(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);
    const policy = await this.ensureRetentionPolicy(pilot);
    return this.toRetentionPolicyDto(policy);
  }

  async upsertRetentionPolicy(
    actor: AuthUser,
    input: { closedCaseRetentionDays: number; redactionEnabled?: boolean },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);

    const days = input.closedCaseRetentionDays;
    if (!Number.isInteger(days) || days < 30 || days > 36500) {
      throw new BadRequestException(
        "closedCaseRetentionDays deve ser inteiro entre 30 e 36500",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.pastoralRetentionPolicy.upsert({
        where: { churchId: pilot.churchId },
        create: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          closedCaseRetentionDays: days,
          redactionEnabled: input.redactionEnabled ?? true,
          updatedByUserId: actor.userId,
        },
        update: {
          closedCaseRetentionDays: days,
          ...(input.redactionEnabled !== undefined
            ? { redactionEnabled: Boolean(input.redactionEnabled) }
            : {}),
          updatedByUserId: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "pastoral.retention.policy.upsert",
          resourceType: "pastoral_retention_policy",
          resourceId: policy.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            closedCaseRetentionDays: policy.closedCaseRetentionDays,
            redactionEnabled: policy.redactionEnabled,
          },
        },
      });
      return this.toRetentionPolicyDto(policy);
    });
  }

  /**
   * Export pastoral controlado — só PASTOR; audit obrigatório (RF-009).
   * Metadados de audit não incluem o texto do summary.
   */
  async exportCases(
    actor: AuthUser,
    filters: {
      personId?: string;
      from?: string;
      to?: string;
      status?: string;
    } = {},
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);

    const status = filters.status
      ? this.requireStatus(filters.status)
      : undefined;
    const from = filters.from
      ? this.parseExportDate(filters.from, "from")
      : undefined;
    const to = filters.to
      ? this.parseExportDate(filters.to, "to")
      : undefined;
    if (from && to && to < from) {
      throw new BadRequestException("to deve ser >= from");
    }

    const rows = await this.prisma.pastoralCase.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(filters.personId ? { personId: filters.personId } : {}),
        ...(status ? { status } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { tasks: { orderBy: { createdAt: "asc" } } },
    });

    const exportedAt = new Date();
    const caseIds = rows.map((r) => r.id);

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "pastoral.export",
        resourceType: "pastoral_case",
        resourceId: pilot.churchId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: {
          count: caseIds.length,
          caseIds,
          filters: {
            personId: filters.personId ?? null,
            from: from?.toISOString() ?? null,
            to: to?.toISOString() ?? null,
            status: status ?? null,
          },
          purpose: "pastoral_care_export",
        },
      },
    });

    return {
      churchId: pilot.churchId,
      exportedAt: exportedAt.toISOString(),
      count: rows.length,
      cases: rows.map((row) => this.toCaseDto(row)),
    };
  }

  /**
   * Aplica retenção: redige `summary` de casos fechados além do prazo.
   * Não apaga o caso (trilha administrativa preservada).
   */
  async applyRetention(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);
    const policy = await this.ensureRetentionPolicy(pilot);

    if (!policy.redactionEnabled) {
      return {
        churchId: pilot.churchId,
        redactionEnabled: false,
        eligibleCount: 0,
        redactedCount: 0,
        cutoffAt: null as string | null,
      };
    }

    const cutoff = new Date(
      Date.now() - policy.closedCaseRetentionDays * 24 * 60 * 60 * 1000,
    );

    const eligible = await this.prisma.pastoralCase.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        status: { in: ["DONE", "CANCELLED"] },
        closedAt: { lte: cutoff },
        summary: { not: null },
      },
      select: { id: true },
    });

    const ids = eligible.map((e) => e.id);

    return this.prisma.$transaction(async (tx) => {
      if (ids.length > 0) {
        await tx.pastoralCase.updateMany({
          where: { id: { in: ids } },
          data: { summary: null },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "pastoral.retention.apply",
          resourceType: "pastoral_retention_policy",
          resourceId: policy.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            cutoffAt: cutoff.toISOString(),
            eligibleCount: ids.length,
            redactedCount: ids.length,
            caseIds: ids,
          },
        },
      });
      return {
        churchId: pilot.churchId,
        redactionEnabled: true,
        eligibleCount: ids.length,
        redactedCount: ids.length,
        cutoffAt: cutoff.toISOString(),
      };
    });
  }

  private async ensureRetentionPolicy(pilot: {
    organizationId: string;
    churchId: string;
  }) {
    const existing = await this.prisma.pastoralRetentionPolicy.findUnique({
      where: { churchId: pilot.churchId },
    });
    if (existing) return existing;
    return this.prisma.pastoralRetentionPolicy.create({
      data: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
  }

  private parseExportDate(value: string, field: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} inválido`);
    }
    return d;
  }

  private toRetentionPolicyDto(policy: {
    id: string;
    organizationId: string;
    churchId: string;
    closedCaseRetentionDays: number;
    redactionEnabled: boolean;
    updatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: policy.id,
      organizationId: policy.organizationId,
      churchId: policy.churchId,
      closedCaseRetentionDays: policy.closedCaseRetentionDays,
      redactionEnabled: policy.redactionEnabled,
      updatedByUserId: policy.updatedByUserId,
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  async getById(actor: AuthUser, caseId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);
    const row = await this.requireCase(caseId, pilot);
    return this.toCaseDto(row);
  }

  async updateStatus(actor: AuthUser, caseId: string, status: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);
    await this.requireCase(caseId, pilot);
    const next = this.requireStatus(status);
    const closed =
      next === "DONE" || next === "CANCELLED" ? new Date() : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pastoralCase.update({
        where: { id: caseId },
        data: {
          status: next,
          closedAt: closed,
        },
        include: { tasks: { orderBy: { createdAt: "asc" } } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "pastoral.case.status",
          resourceType: "pastoral_case",
          resourceId: caseId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { status: next },
        },
      });
      return updated;
    });

    return this.toCaseDto(row);
  }

  async assign(actor: AuthUser, caseId: string, assignedToUserId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);
    await this.requireCase(caseId, pilot);
    if (!assignedToUserId?.trim()) {
      throw new BadRequestException("assignedToUserId é obrigatório");
    }
    await this.requireUser(assignedToUserId);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pastoralCase.update({
        where: { id: caseId },
        data: { assignedToUserId },
        include: { tasks: { orderBy: { createdAt: "asc" } } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "pastoral.case.assign",
          resourceType: "pastoral_case",
          resourceId: caseId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { assignedToUserId },
        },
      });
      return updated;
    });

    return this.toCaseDto(row);
  }

  async addTask(
    actor: AuthUser,
    caseId: string,
    input: { title: string; dueAt?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);
    await this.requireCase(caseId, pilot);

    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException("title é obrigatório");
    }
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException("dueAt inválido");
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.pastoralTask.create({
        data: { caseId, title, dueAt },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "pastoral.task.create",
          resourceType: "pastoral_task",
          resourceId: task.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { caseId },
        },
      });
      return this.toTaskDto(task);
    });
  }

  async updateTaskDone(
    actor: AuthUser,
    caseId: string,
    taskId: string,
    done: boolean,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertPastoralAccess(actor, pilot.organizationId, pilot.churchId);
    await this.requireCase(caseId, pilot);

    const task = await this.prisma.pastoralTask.findFirst({
      where: { id: taskId, caseId },
    });
    if (!task) {
      throw new NotFoundException("Tarefa pastoral não encontrada");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pastoralTask.update({
        where: { id: taskId },
        data: { done: Boolean(done) },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "pastoral.task.done",
          resourceType: "pastoral_task",
          resourceId: taskId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { caseId, done: Boolean(done) },
        },
      });
      return this.toTaskDto(updated);
    });
  }

  private assertPastoralAccess(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    if (!canAccessPastoralCare(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException(
        "Sem permissão de cuidado pastoral nesta congregação",
      );
    }
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException("Usuário assignee não encontrado");
    }
    return user;
  }

  private async requireCase(
    caseId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const row = await this.prisma.pastoralCase.findFirst({
      where: {
        id: caseId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      include: { tasks: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) {
      throw new NotFoundException("Caso pastoral não encontrado");
    }
    return row;
  }

  private requireKind(kind: string): CaseKind {
    if ((CASE_KINDS as readonly string[]).includes(kind)) {
      return kind as CaseKind;
    }
    throw new BadRequestException(`kind inválido: ${kind}`);
  }

  private requireStatus(status: string): CaseStatus {
    if ((CASE_STATUSES as readonly string[]).includes(status)) {
      return status as CaseStatus;
    }
    throw new BadRequestException(`status inválido: ${status}`);
  }

  private toTaskDto(task: {
    id: string;
    caseId: string;
    title: string;
    done: boolean;
    dueAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: task.id,
      caseId: task.caseId,
      title: task.title,
      done: task.done,
      dueAt: task.dueAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toCaseDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    personId: string;
    kind: string;
    status: string;
    title: string;
    summary: string | null;
    assignedToUserId: string | null;
    createdByUserId: string;
    dueAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    tasks: Array<{
      id: string;
      caseId: string;
      title: string;
      done: boolean;
      dueAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      personId: row.personId,
      kind: row.kind,
      status: row.status,
      title: row.title,
      summary: row.summary,
      assignedToUserId: row.assignedToUserId,
      createdByUserId: row.createdByUserId,
      dueAt: row.dueAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      tasks: row.tasks.map((t) => this.toTaskDto(t)),
    };
  }
}
