import { ForbiddenException, Injectable } from "@nestjs/common";
import { canApprovePastoralAdmission, canLeadMinistry, canManageAdmissions, canManageSpecificMinistry, hasAccess, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { canManageConnection } from "../discipleship/connection-access";
import { GroupRequestsService } from "../groups/group-requests.service";
import { PilotService, type PilotChurch } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import { RosterNoticesService } from "../rosters/roster-notices.service";
import { pastoralExpenseLines } from "../finance/pastoral-expense";

type Scope = Pick<PilotChurch, "churchId" | "organizationId">;
type Notice = {
  id: string;
  category: "Escalas" | "Tesouraria" | "Admissões" | "Grupos de Amizade";
  title: string;
  detail: string;
  action: string;
  href: string;
  createdAt: Date;
  state?: string;
};
const PORTAL = "/app/servir/meu-espaco/";
const LIMIT = 50;
const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const WHEN = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

@Injectable()
export class NotificationsService {
  constructor(private readonly db: PrismaService, private readonly pilot: PilotService, private readonly roster: RosterNoticesService, private readonly groups: GroupRequestsService) {}

  async list(actor: AuthUser, now = new Date()) {
    const scope = await this.scope(actor);
    if (!scope) return { items: [], unread: 0 };
    const notices = await this.collect(actor, scope, now);
    const seen = notices.length ? await this.db.workspaceNotificationRead.findMany({
      where: { userId: actor.userId, churchId: scope.churchId, noticeId: { in: notices.map(item => item.id) } },
      select: { noticeId: true, readAt: true },
    }) : [];
    const reads = new Map(seen.map(item => [item.noticeId, item.readAt]));
    const items = notices.map(item => ({ ...item, readAt: reads.get(item.id) ?? null }));
    return { items, unread: items.filter(item => !item.readAt).length };
  }

  async priorities(actor: AuthUser, now = new Date()) {
    const scope = await this.scope(actor);
    if (!scope) return { nextService: null, pending: [] };
    const since = new Date(+now - 30 * 86_400_000);
    const [ids, finance, admissions] = await Promise.all([
      this.managedMinistries(actor, scope), this.finance(actor, scope, since), this.admissions(actor, scope, since),
    ]);
    const next = ids.length ? await this.db.roster.findFirst({
      where: { ...scope, ministryId: { in: ids }, status: "PUBLISHED", serviceAt: { gt: now } },
      orderBy: [{ serviceAt: "asc" }, { id: "asc" }],
      select: { serviceAt: true },
    }) : null;
    const rosters = next ? await this.db.roster.findMany({
      where: { ...scope, ministryId: { in: ids }, status: "PUBLISHED", serviceAt: next.serviceAt },
      orderBy: { id: "asc" },
      select: { id: true, ministryId: true, title: true, module: { select: { name: true } },
        slots: { select: { id: true, assignments: { where: { status: { in: ["PENDING", "CONFIRMED"] } }, select: { id: true }, take: 1 } } } },
    }) : [];
    const teams = rosters.flatMap(roster => {
      if (!roster.ministryId) return [];
      const vacancies = roster.slots.filter(slot => !slot.assignments.length);
      const params = new URLSearchParams({ ministry: roster.ministryId, aba: "escalas", escala: roster.id });
      const anchor = vacancies[0] ? "#posto-" + encodeURIComponent(vacancies[0].id) : "";
      return [{ id: roster.id, title: roster.module?.name ?? roster.title, vacancies: vacancies.length, href: "/app/ministerios/?" + params + anchor }];
    });
    return {
      nextService: next ? { serviceAt: next.serviceAt, teams } : null,
      pending: [...finance, ...admissions]
        .filter(item => item.state === "Aguardando decisão" || item.state === "Em análise")
        .sort((a, b) => +a.createdAt - +b.createdAt)
        .map(({ id, category, title, detail, href }) => ({ id, category, title, detail, href })),
    };
  }

  async markRead(actor: AuthUser, ids: string[]) {
    const scope = await this.scope(actor);
    if (!scope) return { marked: 0 };
    const requested = new Set(ids);
    const data = (await this.collect(actor, scope, new Date()))
      .filter(item => requested.has(item.id))
      .map(item => ({ userId: actor.userId, churchId: scope.churchId, noticeId: item.id }));
    const result = data.length ? await this.db.workspaceNotificationRead.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return { marked: result.count };
  }

  private async scope(actor: AuthUser): Promise<Scope | null> {
    const { organizationId, churchId } = await this.pilot.getPilotChurch();
    if ((actor.organizationId && actor.organizationId !== organizationId) || (actor.churchId && actor.churchId !== churchId)) return null;
    return actor.grants.some(grant => (!grant.organizationId || grant.organizationId === organizationId)
      && (!grant.churchId || grant.churchId === churchId)) ? { organizationId, churchId } : null;
  }

  private async collect(actor: AuthUser, scope: Scope, now: Date) {
    const since = new Date(+now - 30 * 86_400_000);
    const groups = await Promise.all([
      this.volunteer(actor, now), this.declines(actor, scope, since, now), this.finance(actor, scope, since),
      this.admissions(actor, scope, since), this.groupRequests(actor, since),
    ]);
    return groups.flat().sort((a, b) => +b.createdAt - +a.createdAt || a.id.localeCompare(b.id)).slice(0, LIMIT);
  }

  private async volunteer(actor: AuthUser, now: Date): Promise<Notice[]> {
    try {
      const { notices } = await this.roster.list(actor, now);
      return notices.map(row => {
        const status = "inviteStatus" in row ? row.inviteStatus : undefined;
        const invitation = row.kind === "substitute";
        const assignmentId = ["published", "reminder", "rescheduled"].includes(row.kind) ? row.id.split(":")[1] : "";
        return {
          id: row.id, category: "Escalas", title: row.title,
          detail: row.body,
          createdAt: row.createdAt, href: assignmentId ? `${PORTAL}#escala-${encodeURIComponent(assignmentId)}` : invitation ? PORTAL + "#convite-" + encodeURIComponent(row.id.split(":")[1]) : row.path,
          action: invitation && status === "open" ? "Responder ao convite" : row.kind === "survey" ? "Ver pesquisa" : "Ver escala",
          state: status === "accepted" ? "Substituição confirmada" : status === "closed" ? "Convite encerrado" :
            status === "expired" ? "Prazo encerrado" : status === "declined" ? "Convite recusado" : undefined,
        };
      });
    } catch (error) {
      if (error instanceof ForbiddenException) return [];
      throw error;
    }
  }

  private async managedMinistries(actor: AuthUser, scope: Scope) {
    if (!canLeadMinistry(actor.grants, scope)) return [];
    const ministries = await this.db.ministry.findMany({ where: scope, select: { id: true, leaderPersonId: true } });
    return ministries.filter(ministry => canManageSpecificMinistry(actor.grants, actor.personId, {
      ...scope, ministryId: ministry.id, leaderPersonId: ministry.leaderPersonId,
    })).map(ministry => ministry.id);
  }

  private async declines(actor: AuthUser, scope: Scope, since: Date, now: Date): Promise<Notice[]> {
    const ids = await this.managedMinistries(actor, scope);
    if (!ids.length) return [];
    const allowedModules = await this.restrictedModules(actor, scope);
    const rows = await this.db.rosterAssignment.findMany({
      where: { declinedAt: { gte: since }, status: { in: ["DECLINED", "SUBSTITUTED"] },
        slot: { roster: { ...scope, ministryId: { in: ids }, status: { in: ["PUBLISHED", "CLOSED"] } } } },
      orderBy: { declinedAt: "desc" }, take: LIMIT,
      select: { id: true, declinedAt: true, slot: { select: {
        id: true, roleLabel: true,
        roster: { select: { id: true, ministryId: true, title: true, serviceAt: true, status: true, module: { select: { id: true, name: true } } } },
        assignments: { where: { status: { in: ["PENDING", "CONFIRMED"] } }, select: { status: true } },
      } } },
    });
    return rows.flatMap(row => {
      const { slot } = row;
      const { roster } = slot;
      if (!row.declinedAt || !roster.ministryId) return [];
      if (allowedModules && roster.module?.id && !allowedModules.has(roster.module.id)) return [];
      const confirmed = slot.assignments.some(assignment => assignment.status === "CONFIRMED");
      const pending = slot.assignments.some(assignment => assignment.status === "PENDING");
      const closed = roster.status === "CLOSED" || roster.serviceAt <= now;
      const params = new URLSearchParams({ ministry: roster.ministryId, aba: "escalas", escala: roster.id });
      return {
        id: `decline:${row.id}`, category: "Escalas" as const,
        title: confirmed ? `Vaga preenchida · ${slot.roleLabel}` : `Recusa · ${slot.roleLabel}`,
        detail: [roster.module?.name, roster.title, WHEN.format(roster.serviceAt)].filter(Boolean).join(" · "),
        href: `/app/ministerios/?${params}#posto-${encodeURIComponent(slot.id)}`,
        action: confirmed || pending || closed ? "Ver posto" : "Abrir vaga", createdAt: row.declinedAt,
        state: confirmed ? "Vaga preenchida" : closed ? "Culto encerrado" : pending ? "Substituto a confirmar" : "Vaga aberta",
      };
    });
  }

  private async restrictedModules(actor: AuthUser, scope: Scope): Promise<Set<string> | null> {
    const leaders = (this.db as unknown as { ministryRosterModuleLeader?: { findMany: (args: unknown) => Promise<Array<{ moduleId: string; ministryId: string }>> } }).ministryRosterModuleLeader;
    if (!leaders?.findMany || !actor.personId) return null;
    const links = await leaders.findMany({
      where: { personId: actor.personId, churchId: scope.churchId, organizationId: scope.organizationId },
      select: { moduleId: true, ministryId: true },
    });
    if (!links.length) return null;
    const ministries = await this.db.ministry.findMany({
      where: { id: { in: [...new Set(links.map(link => link.ministryId))] } },
      select: { id: true, leaderPersonId: true },
    });
    const restricted = links.filter(link => ministries.find(item => item.id === link.ministryId)?.leaderPersonId !== actor.personId);
    return restricted.length ? new Set(restricted.map(link => link.moduleId)) : null;
  }

  private async finance(actor: AuthUser, scope: Scope, since: Date): Promise<Notice[]> {
    const pastor = hasAccess(actor.grants, { ...scope, roleCodes: [ROLE_CODES.PASTOR] });
    const treasury = hasAccess(actor.grants, { ...scope, roleCodes: [ROLE_CODES.TESOURARIA, ROLE_CODES.PLATFORM_ADMIN] });
    if (!pastor && !treasury) return [];
    const rows = await this.db.ledgerEntry.findMany({
      where: { ...scope, lines: pastoralExpenseLines, OR: [
        ...(pastor ? [{ firstApprovedByUserId: { not: actor.userId },
          OR: [{ status: "PENDING_APPROVAL" as const }, { firstApprovedAt: { gte: since } }] }] : []),
        ...(treasury ? [{ createdByUserId: actor.userId, OR: [{ secondApprovedAt: { gte: since } }, { rejectedAt: { gte: since } }] }] : []),
      ] },
      select: { id: true, description: true, amountCents: true, status: true, createdByUserId: true,
        firstApprovedAt: true, secondApprovedAt: true, rejectedAt: true },
      orderBy: { updatedAt: "desc" }, take: LIMIT,
    });
    return rows.flatMap<Notice>(row => {
      const detail = `${MONEY.format(row.amountCents / 100)} · ${row.description}`;
      const decision = row.rejectedAt ?? row.secondApprovedAt;
      const outcome = row.rejectedAt ? "Despesa recusada" : "Despesa aprovada";
      const personal = treasury && row.createdByUserId === actor.userId && decision;
      if (personal) return [{ id: `expense-result:${row.id}`, category: "Tesouraria", title: outcome, detail, action: "Ver decisão",
        href: `/app/tesouraria/?despesa=${encodeURIComponent(row.id)}#despesas`, createdAt: personal, state: "Decisão registrada" }];
      if (!pastor || !row.firstApprovedAt || row.createdByUserId === actor.userId) return [];
      if (!decision && row.status !== "PENDING_APPROVAL") return [];
      return [{ id: `expense-review:${row.id}`, category: "Tesouraria", title: decision ? outcome : "Despesa para aprovação",
        detail, action: decision ? "Ver aprovações" : "Revisar despesa",
        href: `/app/pastoral/despesas/?despesa=${encodeURIComponent(row.id)}`,
        createdAt: row.firstApprovedAt, state: decision ? "Decisão registrada" : "Aguardando decisão" }];
    });
  }

  private async groupRequests(actor: AuthUser, since: Date): Promise<Notice[]> {
    const requests = await this.groups.inbox(actor, since);
    if (!requests.length) return [];
    const scope = await this.pilot.getPilotChurch();
    const inbox = await canManageConnection(this.db, actor, scope) ? "/app/conexao/" : "/app/servir/meu-espaco/";
    return requests.map(row => ({
      id: `group-request:${row.id}`, category: "Grupos de Amizade", title: "Pedido de entrada em grupo",
      detail: row.person.displayName + " · " + row.group.name, action: "Abrir pedido",
      href: inbox + "#pedido-" + encodeURIComponent(row.id), createdAt: row.createdAt,
      state: row.status === "PENDING" ? "Aguardando resposta" : row.status === "APPROVED" ? "Pedido aceito" : "Pedido recusado",
    }));
  }

  private async admissions(actor: AuthUser, scope: Scope, since: Date): Promise<Notice[]> {
    const stages = [
      ...(canManageAdmissions(actor.grants, scope) ? ["AWAITING_SECRETARIA" as const] : []),
      ...(canApprovePastoralAdmission(actor.grants, scope) ? ["AWAITING_PASTOR" as const] : []),
    ];
    if (!stages.length) return [];
    const [pending, changes] = await Promise.all([
      this.db.admissionProtocol.findMany({ where: { ...scope, status: { in: stages } }, orderBy: { updatedAt: "desc" }, take: LIMIT,
        select: { id: true, status: true, updatedAt: true, person: { select: { displayName: true } } } }),
      this.db.auditLog.findMany({
        where: { ...scope, action: "admission.advance", createdAt: { gte: since },
          OR: stages.map(status => ({ metadata: { path: ["status"], equals: status } })) },
        orderBy: { createdAt: "desc" }, take: LIMIT, select: { resourceId: true, metadata: true, createdAt: true },
      }),
    ]);
    const pastIds = [...new Set(changes.flatMap(change => change.resourceId ? [change.resourceId] : []))];
    const protocols = new Map([...pending, ...await this.db.admissionProtocol.findMany({ where: { ...scope, id: { in: pastIds } },
      select: { id: true, status: true, updatedAt: true, person: { select: { displayName: true } } } })].map(item => [item.id, item]));
    const notices = new Map<string, Notice>();
    function add(id: string, stage: string, createdAt: Date) {
      const row = protocols.get(id);
      if (!row) return;
      const resolved = row.status !== stage;
      const key = `admission:${stage}:${id}`;
      if (notices.has(key)) return;
      const path = stage === "AWAITING_PASTOR" ? "/app/pastoral/admissoes/" : "/app/secretaria/admissoes/";
      notices.set(key, { id: key, category: "Admissões", title: stage === "AWAITING_PASTOR" ? "Admissão para decisão pastoral" : "Admissão para análise da Secretaria",
        detail: row.person.displayName, action: "Abrir protocolo", href: `${path}?protocolo=${encodeURIComponent(id)}`,
        createdAt, state: resolved ? "Etapa concluída" : "Em análise" });
    }
    for (const change of changes) {
      const status = (change.metadata as { status?: string } | null)?.status;
      if (change.resourceId && status && stages.some(stage => stage === status)) add(change.resourceId, status, change.createdAt);
    }
    for (const row of pending) add(row.id, row.status, row.updatedAt);
    return [...notices.values()];
  }
}
