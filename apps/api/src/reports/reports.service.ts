import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import {
  REGISTRATION_STATUSES,
  summarizeParticipation,
  type ParticipationCounts,
  type ParticipationRow,
  type RegistrationStatus,
} from "./participation";
import {
  countsCsv,
  participationCsv,
  renderCountsPdf,
  renderParticipationPdf,
} from "./report-files";
import {
  assertMembershipAccess,
  assertMinisterialAccess,
  assertParticipationAccess,
  eventVisibleToScope,
  ministryScopeIds,
} from "./report-scope";

const FORMAL_MEMBERSHIP_BLOCKED = {
  blocked: true as const,
  code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED",
  members: null,
  message:
    "O vínculo formal de integrante não tem tabela. Interesses de voluntariado não são integrantes e nenhum total foi inventado.",
};

export interface ReportQuery {
  eventId?: string;
  status?: string;
  ministryId?: string;
  from?: string;
  to?: string;
}

export interface ReportFile {
  bytes: Buffer;
  contentType: string;
  filename: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async participation(actor: AuthUser, query: ReportQuery = {}) {
    const pilot = await this.pilot.getPilotChurch();
    assertParticipationAccess(actor, pilot);
    const filters = this.normalizeQuery(query);
    const scope = ministryScopeIds(actor, pilot);
    await this.assertEventScope(filters, scope, pilot);

    if (scope && scope.length === 0) {
      return this.finishParticipation(actor, pilot, filters, [], scope);
    }

    const ministryFilter = filters.ministryId
      ? filters.ministryId
      : scope
        ? { in: scope }
        : undefined;
    const startsAt =
      filters.from || filters.to
        ? {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          }
        : undefined;

    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(filters.eventId ? { eventId: filters.eventId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        event: {
          ...(ministryFilter !== undefined ? { ministryId: ministryFilter } : {}),
          ...(startsAt ? { startsAt } : {}),
        },
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            ministryId: true,
            startsAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return this.finishParticipation(actor, pilot, filters, rows, scope);
  }

  async participationFile(
    actor: AuthUser,
    query: ReportQuery,
    format: "csv" | "pdf",
  ): Promise<ReportFile> {
    const report = await this.participation(actor, query);
    const pilot = await this.pilot.getPilotChurch();
    await this.audit(actor, pilot, `report.participation.${format}`, {
      filters: report.filters,
      counts: report.counts,
    });
    if (format === "csv") {
      return {
        bytes: Buffer.from(participationCsv(report), "utf8"),
        contentType: "text/csv; charset=utf-8",
        filename: "participacao.csv",
      };
    }
    return {
      bytes: await renderParticipationPdf(report),
      contentType: "application/pdf",
      filename: "participacao.pdf",
    };
  }

  async membership(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    assertMembershipAccess(actor, pilot);
    const where = {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    };
    const [grouped, adults, minorsOmitted, adultVisitorsActive] =
      await Promise.all([
        this.prisma.churchMembership.groupBy({
          by: ["status"],
          where,
          _count: { _all: true },
        }),
        this.prisma.churchMembership.groupBy({
          by: ["status"],
          where: { ...where, person: { isMinor: false } },
          _count: { _all: true },
        }),
        this.prisma.churchMembership.count({
          where: { ...where, person: { isMinor: true } },
        }),
        this.prisma.person.count({
          where: {
            organizationId: pilot.organizationId,
            homeChurchId: pilot.churchId,
            kind: "VISITOR",
            status: "ACTIVE",
            isMinor: false,
          },
        }),
      ]);

    const byStatus = countMap(grouped);
    const adultsByStatus = countMap(adults);
    const totalMemberships = sumValues(byStatus);
    const adultMemberships = sumValues(adultsByStatus);
    const report = {
      stub: false as const,
      source: "church_memberships" as const,
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      generatedAt: new Date().toISOString(),
      byStatus,
      adultsByStatus,
      totalMemberships,
      adultMemberships,
      minorsOmitted,
      adultVisitorsActive,
      personsListed: false as const,
      countsMatch: totalMemberships === adultMemberships + minorsOmitted,
      note: "Contagens de church_memberships. Nomes, e-mails e registros de menores não saem neste relatório.",
    };
    await this.audit(actor, pilot, "report.membership.read", {
      byStatus,
      minorsOmitted,
      adultVisitorsActive,
      countsMatch: report.countsMatch,
    });
    return report;
  }

  async membershipFile(
    actor: AuthUser,
    format: "csv" | "pdf",
  ): Promise<ReportFile> {
    const report = await this.membership(actor);
    const lines = [
      ...Object.entries(report.byStatus).map(([status, value]) => ({
        label: `membresia_${status}`,
        value: String(value),
      })),
      ...Object.entries(report.adultsByStatus).map(([status, value]) => ({
        label: `adultos_${status}`,
        value: String(value),
      })),
      { label: "menores_omitidos", value: String(report.minorsOmitted) },
      {
        label: "visitantes_adultos_ativos",
        value: String(report.adultVisitorsActive),
      },
      { label: "contagens_conferem", value: report.countsMatch ? "sim" : "nao" },
    ];
    return this.finishCountFile(
      actor,
      "report.membership",
      format,
      "Relatório de membresia",
      report.note,
      lines,
      "membresia",
      { minorsOmitted: report.minorsOmitted, countsMatch: report.countsMatch },
    );
  }

  async ministries(actor: AuthUser, ministryId?: string) {
    const pilot = await this.pilot.getPilotChurch();
    assertMinisterialAccess(actor, pilot);
    const requested = ministryId?.trim() || undefined;
    const scope = ministryScopeIds(actor, pilot);
    if (requested && scope && !scope.includes(requested)) {
      throw new ForbiddenException("Sem permissão neste ministério");
    }
    if (scope && scope.length === 0) {
      return this.finishMinistries(actor, pilot, [], [], [], null);
    }

    const idFilter = requested ? requested : scope ? { in: scope } : undefined;
    const ministries = await this.prisma.ministry.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(idFilter !== undefined ? { id: idFilter } : {}),
      },
      select: { id: true, name: true, slug: true, publishStatus: true },
      orderBy: { name: "asc" },
    });
    const ids = ministries.map((row) => row.id);
    const eventWhere = {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: { in: ids.length > 0 ? ids : ["__none__"] },
    };
    const [events, interests, unassignedEvents] = await Promise.all([
      ids.length === 0
        ? Promise.resolve([])
        : this.prisma.portalEvent.groupBy({
            by: ["ministryId", "status"],
            where: eventWhere,
            _count: { _all: true },
          }),
      ids.length === 0
        ? Promise.resolve([])
        : this.prisma.volunteerInterest.groupBy({
            by: ["ministryId", "status"],
            where: {
              organizationId: pilot.organizationId,
              churchId: pilot.churchId,
              ministryId: { in: ids },
            },
            _count: { _all: true },
          }),
      scope === null
        ? this.prisma.portalEvent.count({
            where: {
              organizationId: pilot.organizationId,
              churchId: pilot.churchId,
              ministryId: null,
            },
          })
        : Promise.resolve(null),
    ]);

    return this.finishMinistries(
      actor,
      pilot,
      ministries,
      events,
      interests,
      unassignedEvents,
    );
  }

  async ministriesFile(
    actor: AuthUser,
    ministryId: string | undefined,
    format: "csv" | "pdf",
  ): Promise<ReportFile> {
    const report = await this.ministries(actor, ministryId);
    const lines = report.ministries.flatMap((row) => [
      {
        label: `${row.slug}_publicacao`,
        value: row.publishStatus,
      },
      ...Object.entries(row.eventsByStatus).map(([status, value]) => ({
        label: `${row.slug}_eventos_${status}`,
        value: String(value),
      })),
      ...Object.entries(row.volunteerInterestsByStatus).map(([status, value]) => ({
        label: `${row.slug}_interesses_${status}`,
        value: String(value),
      })),
      { label: `${row.slug}_integrantes_formais`, value: "BLOCKED" },
    ]);
    if (report.unassignedEvents !== null) {
      lines.push({
        label: "eventos_sem_ministerio",
        value: String(report.unassignedEvents),
      });
    }
    lines.push({
      label: "vinculo_formal",
      value: report.formalMembership.code,
    });
    return this.finishCountFile(
      actor,
      "report.ministries",
      format,
      "Relatório ministerial",
      report.formalMembership.message,
      lines,
      "ministerios",
      { formalMembership: report.formalMembership.code },
    );
  }

  private normalizeQuery(query: ReportQuery): {
    eventId?: string;
    status?: RegistrationStatus;
    ministryId?: string;
    from?: Date;
    to?: Date;
  } {
    const eventId = query.eventId?.trim() || undefined;
    const ministryId = query.ministryId?.trim() || undefined;
    const statusText = query.status?.trim() || undefined;
    let status: RegistrationStatus | undefined;
    if (statusText) {
      if (!REGISTRATION_STATUSES.includes(statusText as RegistrationStatus)) {
        throw new BadRequestException("status de inscrição inválido");
      }
      status = statusText as RegistrationStatus;
    }
    const from = query.from?.trim() ? parseDate(query.from, "from") : undefined;
    const to = query.to?.trim() ? parseDate(query.to, "to") : undefined;
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException("from não pode ser posterior a to");
    }
    return { eventId, status, ministryId, from, to };
  }

  private async assertEventScope(
    filters: { eventId?: string; ministryId?: string },
    scope: string[] | null,
    pilot: { organizationId: string; churchId: string },
  ) {
    if (filters.ministryId && scope && !scope.includes(filters.ministryId)) {
      throw new ForbiddenException("Sem permissão neste ministério");
    }
    if (!filters.eventId) return;
    const event = await this.prisma.portalEvent.findFirst({
      where: {
        id: filters.eventId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!event) throw new NotFoundException("Evento não encontrado");
    if (!eventVisibleToScope(event.ministryId, scope)) {
      throw new ForbiddenException("Sem permissão neste evento");
    }
    if (filters.ministryId && event.ministryId !== filters.ministryId) {
      throw new BadRequestException("O evento não pertence ao ministério filtrado");
    }
  }

  private async finishParticipation(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    filters: {
      eventId?: string;
      status?: RegistrationStatus;
      ministryId?: string;
      from?: Date;
      to?: Date;
    },
    rows: Array<{
      id: string;
      eventId: string;
      displayName: string;
      partySize: number;
      isMinor: boolean;
      guardianDisplayName?: string | null;
      status: string;
      checkedInAt: Date | null;
      checkInCode?: string | null;
      event?: { name?: string | null } | null;
    }>,
    scope: string[] | null,
  ) {
    const summary = summarizeParticipation(
      rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        eventName: row.event?.name ?? "",
        displayName: row.displayName,
        partySize: row.partySize,
        isMinor: row.isMinor,
        guardianDisplayName: row.guardianDisplayName,
        status: row.status,
        checkedInAt: row.checkedInAt?.toISOString() ?? null,
        checkInCode: row.checkInCode,
      })),
    );
    const report = {
      stub: false as const,
      source: "event_registrations" as const,
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      generatedAt: new Date().toISOString(),
      scope: scope === null ? ("church" as const) : ("ministry" as const),
      filters: {
        eventId: filters.eventId ?? null,
        status: filters.status ?? null,
        ministryId: filters.ministryId ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
      counts: summary.counts,
      rows: summary.rows,
      minorsListed: false as const,
    };
    await this.audit(actor, pilot, "report.participation.read", {
      filters: report.filters,
      counts: report.counts,
    });
    return report;
  }

  private async finishMinistries(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    ministries: Array<{
      id: string;
      name: string;
      slug: string;
      publishStatus: string;
    }>,
    events: Array<{ ministryId: string | null; status: string; _count: { _all: number } }>,
    interests: Array<{
      ministryId: string;
      status: string;
      _count: { _all: number };
    }>,
    unassignedEvents: number | null,
  ) {
    const report = {
      stub: false as const,
      source: "ministries" as const,
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      generatedAt: new Date().toISOString(),
      formalMembership: FORMAL_MEMBERSHIP_BLOCKED,
      unassignedEvents,
      ministries: ministries.map((ministry) => ({
        id: ministry.id,
        name: ministry.name,
        slug: ministry.slug,
        publishStatus: ministry.publishStatus,
        eventsByStatus: groupedCount(
          events.filter((row) => row.ministryId === ministry.id),
        ),
        volunteerInterestsByStatus: groupedCount(
          interests.filter((row) => row.ministryId === ministry.id),
        ),
        formalMembers: null,
      })),
    };
    await this.audit(actor, pilot, "report.ministries.read", {
      ministries: report.ministries.length,
      formalMembership: report.formalMembership.code,
      unassignedEvents,
    });
    return report;
  }

  private async finishCountFile(
    actor: AuthUser,
    actionPrefix: string,
    format: "csv" | "pdf",
    title: string,
    note: string,
    lines: Array<{ label: string; value: string }>,
    filename: string,
    metadata: object,
  ): Promise<ReportFile> {
    const pilot = await this.pilot.getPilotChurch();
    await this.audit(actor, pilot, `${actionPrefix}.${format}`, metadata);
    const input = {
      title,
      generatedAt: new Date().toISOString(),
      churchId: pilot.churchId,
      lines,
      note,
    };
    if (format === "csv") {
      return {
        bytes: Buffer.from(countsCsv(input), "utf8"),
        contentType: "text/csv; charset=utf-8",
        filename: `${filename}.csv`,
      };
    }
    return {
      bytes: await renderCountsPdf(input),
      contentType: "application/pdf",
      filename: `${filename}.pdf`,
    };
  }

  private async audit(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    action: string,
    metadata: object,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action,
        resourceType: "report",
        resourceId: pilot.churchId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonObject,
      },
    });
  }
}

function countMap(
  rows: Array<{ status: string; _count: { _all: number } }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = row._count._all;
  return out;
}

function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function groupedCount(
  rows: Array<{ status: string; _count: { _all: number } }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = row._count._all;
  return out;
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} inválido`);
  }
  return date;
}

export type { ParticipationCounts, ParticipationRow };
