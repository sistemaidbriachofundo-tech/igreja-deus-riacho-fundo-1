import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { assertMembershipAccess } from "./report-scope";
import { buildMembershipInsights, parseInsightsPeriod } from "./membership-insights-domain";

/**
 * Dados originados diretamente de PostgreSQL/Prisma, no escopo da congregação.
 * Somente Secretaria, Pastor ou Administrador com grants válidos podem ler.
 * Não entrega contato, CPF, endereço, anotações ou identificação de menores.
 */
@Injectable()
export class MembershipInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async overview(actor: AuthUser, query: { from?: string; to?: string } = {}) {
    const pilot = await this.pilot.getPilotChurch();
    assertMembershipAccess(actor, pilot);
    const now = new Date();
    const period = parseInsightsPeriod(query.from, query.to, now);
    const common = { organizationId: pilot.organizationId, churchId: pilot.churchId };
    const [memberships, registeredPersons, visitorsActive, transfers, recentPeople] = await Promise.all([
      this.prisma.churchMembership.findMany({
        where: common,
        select: {
          id: true, status: true, joinedAt: true, leftAt: true,
          person: { select: {
            id: true, displayName: true, birthDate: true, baptismDate: true,
            weddingDate: true, firstAttendedOn: true, sex: true,
            isMinor: true, createdAt: true,
          } },
        },
      }),
      this.prisma.person.count({ where: {
        organizationId: pilot.organizationId, homeChurchId: pilot.churchId,
      } }),
      this.prisma.person.count({ where: {
        organizationId: pilot.organizationId, homeChurchId: pilot.churchId,
        kind: "VISITOR", status: "ACTIVE",
      } }),
      this.prisma.membershipTransfer.findMany({
        where: {
          organizationId: pilot.organizationId,
          status: "COMPLETED",
          completedAt: { gte: period.from, lte: period.to },
          OR: [{ fromChurchId: pilot.churchId }, { toChurchId: pilot.churchId }],
        },
        select: {
          status: true, fromChurchId: true, toChurchId: true, completedAt: true,
        },
      }),
      this.prisma.person.findMany({
        where: {
          organizationId: pilot.organizationId, homeChurchId: pilot.churchId,
          isMinor: false,
        },
        orderBy: { createdAt: "desc" },
        take: 16,
        select: { id: true, displayName: true, createdAt: true, kind: true },
      }),
    ]);
    return buildMembershipInsights({
      memberships, registeredPersons, visitorsActive, transfers, recentPeople,
      churchId: pilot.churchId, churchName: pilot.churchName, period, now,
    });
  }
}
