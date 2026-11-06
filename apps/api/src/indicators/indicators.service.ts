import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  canAccessChurch,
  isPlatformAdminInOrg,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

/**
 * Stubs de leitura F6 — indicadores institucionais.
 * Contagens reais mínimas; contrato marcado `stub: true` até dashboards maduros.
 */
@Injectable()
export class IndicatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async summary(
    actor: AuthUser,
    options?: { churchId?: string; scope?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const organizationId = actor.organizationId ?? pilot.organizationId;
    const wantsOrgWide = options?.scope === "organization";

    if (wantsOrgWide) {
      if (!isPlatformAdminInOrg(actor.grants, organizationId)) {
        throw new ForbiddenException(
          "Indicadores org-wide exigem PLATFORM_ADMIN",
        );
      }
      return this.buildSummary(organizationId, null);
    }

    const churchId =
      options?.churchId ?? actor.churchId ?? pilot.churchId;
    this.assertChurchAccess(actor, organizationId, churchId);
    return this.buildSummary(organizationId, churchId);
  }

  async membership(actor: AuthUser, churchIdQuery?: string) {
    const pilot = await this.pilot.getPilotChurch();
    const organizationId = actor.organizationId ?? pilot.organizationId;
    const churchId = churchIdQuery ?? actor.churchId ?? pilot.churchId;
    this.assertChurchAccess(actor, organizationId, churchId);

    const grouped = await this.prisma.churchMembership.groupBy({
      by: ["status"],
      where: { organizationId, churchId },
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    for (const row of grouped) {
      byStatus[row.status] = row._count._all;
    }

    return {
      stub: true as const,
      organizationId,
      churchId,
      generatedAt: new Date().toISOString(),
      byStatus,
    };
  }

  private async buildSummary(
    organizationId: string,
    churchId: string | null,
  ) {
    const churchFilter = churchId ? { churchId } : {};

    const [
      membershipsActive,
      membershipsPending,
      admissionsOpen,
      transfersOpen,
      pastoralOpen,
    ] = await Promise.all([
      this.prisma.churchMembership.count({
        where: {
          organizationId,
          ...churchFilter,
          status: "ACTIVE",
        },
      }),
      this.prisma.churchMembership.count({
        where: {
          organizationId,
          ...churchFilter,
          status: "PENDING_ADMISSION",
        },
      }),
      this.prisma.admissionProtocol.count({
        where: {
          organizationId,
          ...churchFilter,
          status: {
            in: [
              "DRAFT",
              "AWAITING_DOCUMENTS",
              "AWAITING_SECRETARIA",
              "AWAITING_PASTOR",
            ],
          },
        },
      }),
      this.prisma.membershipTransfer.count({
        where: {
          organizationId,
          status: {
            in: ["DRAFT", "AWAITING_ORIGIN", "AWAITING_DESTINATION"],
          },
          ...(churchId
            ? {
                OR: [{ fromChurchId: churchId }, { toChurchId: churchId }],
              }
            : {}),
        },
      }),
      this.prisma.pastoralCase.count({
        where: {
          organizationId,
          ...churchFilter,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
    ]);

    return {
      stub: true as const,
      organizationId,
      churchId,
      scope: churchId ? ("church" as const) : ("organization" as const),
      generatedAt: new Date().toISOString(),
      counts: {
        membershipsActive,
        membershipsPending,
        admissionsOpen,
        transfersOpen,
        pastoralOpen,
      },
    };
  }

  private assertChurchAccess(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ) {
    if (!canAccessChurch(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException(
        "Sem grant para indicadores nesta congregação",
      );
    }
  }
}
