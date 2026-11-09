import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  canAccessChurch,
  canAccessPastoralCare,
  isPlatformAdminInOrg,
  type IndicatorsSummaryDto,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

/**
 * RF-029 — indicadores institucionais com agregações Prisma reais.
 * Sem métricas espirituais / scores de maturidade — só contagens operacionais.
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
      return this.buildSummary(actor, organizationId, null);
    }

    const churchId =
      options?.churchId ?? actor.churchId ?? pilot.churchId;
    this.assertChurchAccess(actor, organizationId, churchId);
    return this.buildSummary(actor, organizationId, churchId);
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
      stub: false as const,
      spiritualScoreExcluded: true as const,
      organizationId,
      churchId,
      generatedAt: new Date().toISOString(),
      byStatus,
    };
  }

  private async buildSummary(
    actor: AuthUser,
    organizationId: string,
    churchId: string | null,
  ): Promise<IndicatorsSummaryDto> {
    const churchFilter = churchId ? { churchId } : {};
    const now = new Date();
    const includePastoralOpen = this.canReadPastoralOpen(
      actor,
      organizationId,
      churchId,
    );

    const visitorWhere = {
      organizationId,
      kind: "VISITOR" as const,
      status: "ACTIVE" as const,
      ...(churchId ? { homeChurchId: churchId } : {}),
    };

    const [
      membershipsActive,
      membershipsPending,
      visitorsActive,
      admissionsOpen,
      transfersOpen,
      pastoralOpen,
      ministriesTotal,
      ministriesPublished,
      eventsPublished,
      eventsPublishedUpcoming,
      rostersDraft,
      rostersPublished,
      rosterAssignmentsPending,
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
      this.prisma.person.count({ where: visitorWhere }),
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
      includePastoralOpen
        ? this.prisma.pastoralCase.count({
            where: {
              organizationId,
              ...churchFilter,
              status: { in: ["OPEN", "IN_PROGRESS"] },
            },
          })
        : Promise.resolve(undefined),
      this.prisma.ministry.count({
        where: {
          organizationId,
          ...churchFilter,
          publishStatus: { not: "ARCHIVED" },
        },
      }),
      this.prisma.ministry.count({
        where: {
          organizationId,
          ...churchFilter,
          publishStatus: "PUBLISHED",
        },
      }),
      this.prisma.portalEvent.count({
        where: {
          organizationId,
          ...churchFilter,
          status: "PUBLISHED",
        },
      }),
      this.prisma.portalEvent.count({
        where: {
          organizationId,
          ...churchFilter,
          status: "PUBLISHED",
          startsAt: { gte: now },
        },
      }),
      this.prisma.roster.count({
        where: {
          organizationId,
          ...churchFilter,
          status: "DRAFT",
        },
      }),
      this.prisma.roster.count({
        where: {
          organizationId,
          ...churchFilter,
          status: "PUBLISHED",
        },
      }),
      this.prisma.rosterAssignment.count({
        where: {
          status: "PENDING",
          slot: {
            roster: {
              organizationId,
              ...churchFilter,
            },
          },
        },
      }),
    ]);

    return {
      stub: false as const,
      spiritualScoreExcluded: true as const,
      organizationId,
      churchId,
      scope: churchId ? ("church" as const) : ("organization" as const),
      generatedAt: new Date().toISOString(),
      counts: {
        membershipsActive,
        membershipsPending,
        visitorsActive,
        admissionsOpen,
        transfersOpen,
        ...(pastoralOpen === undefined ? {} : { pastoralOpen }),
        ministriesTotal,
        ministriesPublished,
        eventsPublished,
        eventsPublishedUpcoming,
        rostersDraft,
        rostersPublished,
        rosterAssignmentsPending,
      },
      redacted: pastoralOpen === undefined ? ["pastoralOpen"] : [],
    };
  }

  /**
   * Contagem de casos abertos segue o contrato já integrado de cuidado
   * pastoral: só PASTOR na congregação. PLATFORM_ADMIN, secretaria, líder,
   * tesouraria, editor, membro e visitante não leem. Escopo de organização
   * não tem célula pastoral — o agregado org-wide fica de fora.
   */
  private canReadPastoralOpen(
    actor: AuthUser,
    organizationId: string,
    churchId: string | null,
  ): boolean {
    if (!churchId) {
      return false;
    }
    return canAccessPastoralCare(actor.grants, { organizationId, churchId });
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
