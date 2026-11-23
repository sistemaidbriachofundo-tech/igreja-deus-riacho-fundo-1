import { BadRequestException, Injectable } from "@nestjs/common";
import { MEMBERSHIP_MAP_STATUSES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { assertMembershipAccess } from "./report-scope";
import { anniversary, buildMembershipInsights, parseInsightsPeriod, saoPauloDate } from "./membership-insights-domain";
import { normalizeAccountPhone } from "../account/account-phone";
import { buildMembershipMap } from "./membership-map";

/**
 * Dados originados diretamente de PostgreSQL/Prisma, no escopo da congregação.
 * Somente Secretaria, Pastor ou Administrador com grants válidos podem ler.
 * O relatório agregado não entrega contatos. A consulta operacional de
 * aniversários aplica o mesmo escopo e usa o responsável como contato do menor.
 */
@Injectable()
export class MembershipInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async birthdays(actor: AuthUser, period = "today") {
    const pilot = await this.pilot.getPilotChurch();
    assertMembershipAccess(actor, pilot);
    if (!["today", "week", "month"].includes(period)) {
      throw new BadRequestException("Selecione hoje, próximos 7 dias ou este mês.");
    }
    const today = saoPauloDate(new Date());
    const endOfMonth = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();
    const firstDay = period === "month" ? 1 - today.day : 0;
    const lastDay = period === "month" ? endOfMonth - today.day : period === "week" ? 6 : 0;
    const people = await this.prisma.person.findMany({
      where: {
        organizationId: pilot.organizationId, status: "ACTIVE", birthDate: { not: null },
        OR: [
          { homeChurchId: pilot.churchId },
          { memberships: { some: { churchId: pilot.churchId, status: "ACTIVE" } } },
          { discipleshipEnrollments: { some: { status: "ACTIVE", track: { churchId: pilot.churchId } } } },
        ],
      },
      select: {
        id: true, displayName: true, birthDate: true, isMinor: true, phone: true,
        communicationConsents: {
          where: { churchId: pilot.churchId }, select: { whatsappOptIn: true, revokedAt: true },
        },
        legalGuardian: {
          select: {
            organizationId: true, homeChurchId: true, status: true, phone: true, isMinor: true, birthDate: true,
            memberships: { where: { churchId: pilot.churchId, status: "ACTIVE" }, select: { id: true } },
            communicationConsents: {
              where: { churchId: pilot.churchId }, select: { whatsappOptIn: true, revokedAt: true },
            },
          },
        },
      },
    });
    const dateKey = (date: Date) => date.toISOString().slice(0, 10);
    const adultCutoff = `${today.year - 18}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
    const birthdayRows = people.flatMap(person => {
      if (!person.birthDate) return [];
      const occurrence = anniversary(person.birthDate, today, firstDay, lastDay);
      if (!occurrence) return [];
      const minor = person.isMinor || dateKey(person.birthDate) > adultCutoff;
      const guardian = person.legalGuardian;
      const contact = minor ? guardian && guardian.organizationId === pilot.organizationId
        && (guardian.homeChurchId === pilot.churchId || guardian.memberships.length > 0)
        && guardian.status === "ACTIVE" && !guardian.isMinor
        && (!guardian.birthDate || dateKey(guardian.birthDate) <= adultCutoff) ? guardian : null : person;
      const preference = contact?.communicationConsents[0];
      const blocked = Boolean(preference && (!preference.whatsappOptIn || preference.revokedAt));
      let phone: string | null = null;
      if (contact?.phone && !blocked) {
        try { phone = normalizeAccountPhone(contact.phone); } catch { /* Cadastro anterior pode conter um formato inválido. */ }
      }
      return [{
        id: person.id, name: person.displayName, date: occurrence.day, daysAway: occurrence.daysAway,
        phone, contactKind: minor ? "GUARDIAN" : "PERSON", contactBlocked: blocked,
      }];
    });
    birthdayRows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pt-BR"));
    return { birthdays: birthdayRows };
  }

  async map(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    assertMembershipAccess(actor, pilot);
    const memberships = await this.prisma.churchMembership.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        status: { in: [...MEMBERSHIP_MAP_STATUSES] },
        person: { organizationId: pilot.organizationId },
      },
      select: { status: true, person: { select: { address: true } } },
    });
    return buildMembershipMap(memberships);
  }

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
        select: { id: true, displayName: true, createdAt: true, kind: true, isMinor: true, birthDate: true },
      }),
    ]);
    return buildMembershipInsights({
      memberships, registeredPersons, visitorsActive, transfers, recentPeople,
      churchId: pilot.churchId, churchName: pilot.churchName, period, now,
    });
  }
}
