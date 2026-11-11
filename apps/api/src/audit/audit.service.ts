import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from "@nestjs/common";
import { canReadAudit, isPlatformAdminInOrg, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { redactAuditMetadata } from "./audit-metadata.redactor";
import type { AuditActorContext, AuditDenialReason } from "./audit-command";
import { normalizeCorrelationHeader } from "./audit-command";
import {
  AUDIT_RETENTION_POLICY,
  AuditWriterService,
  type AuditWriteClient,
} from "./audit-writer.service";
import {
  AuditFilterError,
  auditVisibilityFor,
  buildAuditWhere,
  encodeAuditCursor,
  eventVisible,
  parseAuditQuery,
  readStoredOutcome,
  sensitivityOf,
} from "./audit-read";

type AuditRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  metadata: unknown;
  createdAt: Date;
  churchId?: string | null;
};

const AUDIT_ROLES = new Set<string>([
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
]);

@Injectable()
export class AuditService {
  private readonly writer: AuditWriterService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    @Optional() writer?: AuditWriterService,
  ) {
    this.writer = writer ?? new AuditWriterService(prisma);
  }

  /**
   * Lista recente.
   * - Default: congregação ativa (ou RF1).
   * - `churchId`: congregação pedida, se o grant cobrir.
   * - `scope=organization`: PLATFORM_ADMIN na organização do token.
   * Secretaria não recebe eventos financeiros nem pastorais.
   * Pastor não recebe eventos financeiros.
   * PLATFORM_ADMIN vê a trilha, com metadata redigida.
   */
  async listRecent(
    actor: AuthUser,
    limit = 50,
    options?: {
      churchId?: string;
      scope?: string;
      cursor?: string;
      action?: string;
      resourceType?: string;
      from?: string;
      to?: string;
      outcome?: string;
      correlationId?: string;
    },
  ) {
    return this.read(actor, limit, options, false);
  }

  async exportSanitized(
    actor: AuthUser,
    limit = 200,
    options?: {
      churchId?: string;
      scope?: string;
      cursor?: string;
      action?: string;
      resourceType?: string;
      from?: string;
      to?: string;
      outcome?: string;
      correlationId?: string;
    },
  ) {
    const page = await this.read(actor, limit, options, true);
    return {
      ...page,
      sanitized: true as const,
      retention: AUDIT_RETENTION_POLICY,
      integrity: {
        claim: "application_hash_chain" as const,
        provesInviolability: false as const,
        note: "Cadeia SHA-256 no processo aplicativo, por congregação. Não prova inviolabilidade do banco.",
      },
    };
  }

  private async read(
    actor: AuthUser,
    limit: number,
    options: {
      churchId?: string;
      scope?: string;
      cursor?: string;
      action?: string;
      resourceType?: string;
      from?: string;
      to?: string;
      outcome?: string;
      correlationId?: string;
    } | undefined,
    exporting: boolean,
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const organizationId = actor.organizationId ?? pilot.organizationId;
    let query;
    try {
      query = parseAuditQuery(exporting ? Math.min(limit, 200) : limit, options);
    } catch (error) {
      if (error instanceof AuditFilterError) {
        throw new BadRequestException("Filtro de auditoria inválido.");
      }
      throw error;
    }

    const correlationId = normalizeCorrelationHeader(options?.correlationId);
    const wantsOrgWide = options?.scope === "organization";

    if (wantsOrgWide) {
      if (!isPlatformAdminInOrg(actor.grants, organizationId)) {
        await this.deny(actor, organizationId, actor.churchId ?? null, "org_scope", correlationId);
        throw new ForbiddenException("Auditoria org-wide exige PLATFORM_ADMIN");
      }
      return this.fetch(actor, {
        organizationId,
        churchId: null,
        scope: "organization",
        query,
      });
    }

    const churchId = options?.churchId || actor.churchId || pilot.churchId;
    if (!canReadAudit(actor.grants, { organizationId, churchId })) {
      await this.deny(
        actor,
        organizationId,
        actor.churchId ?? null,
        this.denialReason(actor, organizationId),
        correlationId,
      );
      throw new ForbiddenException("Sem permissão para auditoria");
    }

    return this.fetch(actor, {
      organizationId,
      churchId,
      scope: "church",
      query,
    });
  }

  private async fetch(
    actor: AuthUser,
    input: {
      organizationId: string;
      churchId: string | null;
      scope: "organization" | "church";
      query: ReturnType<typeof parseAuditQuery>;
    },
  ) {
    const visibility = auditVisibilityFor(actor.grants, {
      organizationId: input.organizationId,
      churchId: input.churchId,
    });
    const where = buildAuditWhere({
      organizationId: input.organizationId,
      churchId: input.churchId,
      scope: input.scope,
      query: input.query,
      visibility,
    });
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.query.take + 1,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        actorUserId: true,
        metadata: true,
        createdAt: true,
        churchId: true,
      },
    });
    const visible = rows.filter((row: AuditRow) =>
      eventVisible(visibility, row.action, row.resourceType),
    );
    const page = visible.slice(0, input.query.take);
    const last = page[page.length - 1];
    const nextCursor =
      visible.length > input.query.take && last
        ? encodeAuditCursor({ createdAt: last.createdAt, id: last.id })
        : null;
    return {
      organizationId: input.organizationId,
      churchId: input.scope === "organization" ? null : input.churchId,
      scope: input.scope,
      logs: page.map((row: AuditRow) => this.toEntry(row)),
      nextCursor,
    };
  }

  private toEntry(row: AuditRow) {
    const metadata = redactAuditMetadata(row.action, row.metadata);
    return {
      id: row.id,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      actorUserId: row.actorUserId,
      churchId: row.churchId ?? null,
      sensitivity: sensitivityOf(row.action, row.resourceType),
      outcome: readStoredOutcome(metadata),
      metadata,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private denialReason(actor: AuthUser, organizationId: string): AuditDenialReason {
    const staff = actor.grants.some(
      (grant) =>
        AUDIT_ROLES.has(grant.roleCode) &&
        (!grant.organizationId || grant.organizationId === organizationId),
    );
    return staff ? "church_scope" : "role";
  }

  private async deny(
    actor: AuthUser,
    organizationId: string,
    churchId: string | null,
    reason: AuditDenialReason,
    correlationId: string | undefined,
  ) {
    const context: AuditActorContext = {
      userId: actor.userId,
      organizationId,
      churchId,
    };
    await this.writer.recordDenial(this.prisma as unknown as AuditWriteClient, {
      actor: context,
      reason,
      correlationId: correlationId ?? null,
    });
  }
}
