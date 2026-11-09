import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  canReadAudit,
  isPlatformAdminInOrg,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { redactAuditMetadata } from "./audit-metadata.redactor";

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

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  /**
   * Lista recente.
   * - Default: congregação ativa (ou RF1) — produto single-church.
   * - `churchId` query: church específica se grant cobrir.
   * - `scope=organization`: PLATFORM_ADMIN cross-church na org.
   */
  async listRecent(
    actor: AuthUser,
    limit = 50,
    options?: { churchId?: string; scope?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const organizationId = actor.organizationId ?? pilot.organizationId;
    const take = Math.min(Math.max(limit, 1), 200);

    const wantsOrgWide = options?.scope === "organization";

    if (wantsOrgWide) {
      if (!isPlatformAdminInOrg(actor.grants, organizationId)) {
        throw new ForbiddenException(
          "Auditoria org-wide exige PLATFORM_ADMIN",
        );
      }

      const rows = await this.prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take,
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

      return {
        organizationId,
        churchId: null as string | null,
        scope: "organization" as const,
        logs: rows.map((row: AuditRow) => this.toEntry(row)),
      };
    }

    const churchId =
      options?.churchId ?? actor.churchId ?? pilot.churchId;

    if (!canReadAudit(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException("Sem permissão para auditoria");
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        churchId,
      },
      orderBy: { createdAt: "desc" },
      take,
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

    return {
      organizationId,
      churchId,
      scope: "church" as const,
      logs: rows.map((row: AuditRow) => this.toEntry(row)),
    };
  }

  private toEntry(row: AuditRow) {
    return {
      id: row.id,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      actorUserId: row.actorUserId,
      metadata: redactAuditMetadata(row.action, row.metadata),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
