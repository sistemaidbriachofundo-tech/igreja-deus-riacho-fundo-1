import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  linkFromPrevious,
  sealAuditMetadata,
} from "./audit-chain";
import {
  AuditImmutableError,
  AuditWriteError,
  isBestEffortDenial,
  normalizeDenialReason,
  sanitizeWriteMetadata,
  validateAuditCommand,
  type AuditActorContext,
  type AuditEventDraft,
  type AuditOutcome,
  type AuditWriteCommand,
} from "./audit-command";

export const AUDIT_RETENTION_REVIEW_DAYS = 1825;

export const AUDIT_RETENTION_POLICY = {
  mode: "preserve" as const,
  reviewAfterDays: AUDIT_RETENTION_REVIEW_DAYS,
  destroysRows: false as const,
};

export interface AuditWriteClient {
  auditLog: {
    create(args: {
      data: {
        actorUserId: string | null;
        action: string;
        resourceType: string;
        resourceId: string | null;
        organizationId: string;
        churchId: string | null;
        metadata: Record<string, unknown>;
        createdAt: Date;
      };
    }): Promise<{ id: string; createdAt: Date }>;
    findFirst(args: {
      where: { organizationId: string; churchId: string | null };
      orderBy: Array<{ createdAt: "desc" } | { id: "desc" }>;
      select: { id: true; metadata: true; createdAt: true };
    }): Promise<{ id: string; metadata: unknown; createdAt: Date } | null>;
  };
}

export interface AuditWriteResult {
  recorded: boolean;
  id: string | null;
  createdAt: Date | null;
  action: string;
  outcome: AuditOutcome;
  organizationId: string;
  churchId: string | null;
}

export interface AuditRetentionReport {
  mode: "preserve";
  reviewAfterDays: number;
  destroysRows: false;
  deleted: 0;
  olderThanReviewWindow: number;
  cutoff: string;
}

/**
 * Escrita única de auditoria. O chamador passa o client da transação
 * de negócio (`tx`) para o registro cair ou voltar junto com a operação.
 * Ator, tenant, congregação, outcome e correlação vêm do comando do
 * servidor, não do JSON do cliente.
 */
@Injectable()
export class AuditWriterService {
  /** Relógio do processo. Testes substituem; o cliente não envia timestamp. */
  now: () => Date = () => new Date();

  constructor(private readonly prisma: PrismaService) {}

  async write(
    db: AuditWriteClient,
    command: AuditWriteCommand,
  ): Promise<AuditWriteResult> {
    const bestEffort = isBestEffortDenial(command);
    try {
      const validated = validateAuditCommand(command);
      const previous = await db.auditLog.findFirst({
        where: {
          organizationId: validated.actor.organizationId,
          churchId: validated.actor.churchId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, metadata: true, createdAt: true },
      });
      const createdAt = this.now();
      const base = sanitizeWriteMetadata(validated.action, validated.metadata);
      const link = linkFromPrevious(previous);
      const sealed = sealAuditMetadata(base, {
        ...link,
        actorUserId: validated.actor.userId,
        organizationId: validated.actor.organizationId,
        churchId: validated.actor.churchId,
        action: validated.action,
        resourceType: validated.resourceType,
        resourceId: validated.resourceId,
        outcome: validated.outcome,
        correlationId: validated.correlationId,
        createdAt,
      });
      const row = await db.auditLog.create({
        data: {
          actorUserId: validated.actor.userId,
          action: validated.action,
          resourceType: validated.resourceType,
          resourceId: validated.resourceId,
          organizationId: validated.actor.organizationId,
          churchId: validated.actor.churchId,
          metadata: sealed.metadata,
          createdAt,
        },
      });
      return {
        recorded: true,
        id: row.id,
        createdAt: row.createdAt,
        action: validated.action,
        outcome: validated.outcome,
        organizationId: validated.actor.organizationId,
        churchId: validated.actor.churchId,
      };
    } catch (error) {
      if (bestEffort) {
        return {
          recorded: false,
          id: null,
          createdAt: null,
          action: command.action,
          outcome: "denied",
          organizationId: command.actor?.organizationId ?? "",
          churchId: command.actor?.churchId ?? null,
        };
      }
      if (error instanceof AuditWriteError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AuditCommandError") {
        throw error;
      }
      throw new AuditWriteError();
    }
  }

  /**
   * Abre a transação, corre o trabalho e grava a auditoria no mesmo client.
   * Se a gravação falha, o callback rejeita e o runner descarta o estágio.
   */
  async commitWith<T>(
    actor: AuditActorContext,
    work: (
      tx: AuditWriteClient,
    ) => Promise<{ result: T; event: AuditEventDraft }>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as AuditWriteClient;
      const { result, event } = await work(client);
      await this.write(client, { ...event, actor });
      return result;
    }, { isolationLevel: "Serializable" });
  }

  /**
   * Tentativa negada: reason de um conjunto fechado, sem corpo, sem e-mail,
   * sem metadata livre. Falha desta gravação não esconde o 403.
   */
  async recordDenial(
    db: AuditWriteClient,
    input: {
      actor: AuditActorContext;
      reason: string;
      correlationId?: string | null;
      action?: "audit.read.denied" | "access.denied";
    },
  ): Promise<AuditWriteResult> {
    return this.write(db, {
      actor: input.actor,
      action: input.action ?? "audit.read.denied",
      resourceType: "audit_log",
      resourceId: null,
      outcome: "denied",
      correlationId: input.correlationId ?? null,
      metadata: { reason: normalizeDenialReason(input.reason) },
      bestEffort: true,
    });
  }

  update(): never {
    throw new AuditImmutableError();
  }

  delete(): never {
    throw new AuditImmutableError();
  }

  purge(): never {
    throw new AuditImmutableError();
  }

  /**
   * Conta linhas antigas para revisão. Não apaga e não reescreve.
   */
  async inspectRetention(
    db: {
      auditLog: {
        count(args: {
          where: { organizationId: string; createdAt: { lt: Date } };
        }): Promise<number>;
      };
    },
    organizationId: string,
  ): Promise<AuditRetentionReport> {
    const cutoff = new Date(
      this.now().getTime() - AUDIT_RETENTION_REVIEW_DAYS * 24 * 60 * 60 * 1000,
    );
    const olderThanReviewWindow = await db.auditLog.count({
      where: { organizationId, createdAt: { lt: cutoff } },
    });
    return {
      ...AUDIT_RETENTION_POLICY,
      deleted: 0,
      olderThanReviewWindow,
      cutoff: cutoff.toISOString(),
    };
  }
}
