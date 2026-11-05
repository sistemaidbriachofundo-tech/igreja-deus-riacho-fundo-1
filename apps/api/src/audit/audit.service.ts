import { ForbiddenException, Injectable } from "@nestjs/common";
import { canManageMemberships, canApprovePastoralAdmission } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  /** Lista recente no piloto — sem PII sensível além do já gravado em metadata. */
  async listRecent(actor: AuthUser, limit = 50) {
    const pilot = await this.pilot.getPilotChurch();
    const allowed =
      canManageMemberships(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      }) ||
      canApprovePastoralAdmission(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      });
    if (!allowed) {
      throw new ForbiddenException("Sem permissão para auditoria");
    }

    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
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
      },
    });

    return {
      churchId: pilot.churchId,
      logs: rows.map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        actorUserId: row.actorUserId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
