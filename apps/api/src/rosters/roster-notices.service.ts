import { createHash, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { grantMatchesScope, ROLE_CODES } from "@idbrf/shared";
import webPush from "web-push";
import type { AuthUser } from "../auth/types/auth-user";
import { BirthdayNoticesService } from "../piloto/birthday-notices.service";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import { churchDayKey } from "./church-day";
import { writeRosterAssignment } from "./roster-assignment-transaction";
import { effectiveInviteLimit, leadershipSummaryDue, weeklyConfirmationDue } from "./roster-module-policy";
import { maintainRosterCycle, recordNoticeDeliveries, rulesWithTeam, volunteerIdsByModule } from "./roster-module-runtime";
import { isModuleVolunteer, readModuleRules } from "./roster-operating-rules";
import { acceptSubstitute, inviteAssignment, inviteKey, substitutionCandidates } from "./roster-substitution-invites";
import { acceptSlotInvitation, declineSlotInvitation } from "./roster-team";

const PORTAL = "/app/servir/meu-espaco/";
const DAY = 86_400_000;
const HOUR = 3_600_000;
// A periodic run can land at either end of the hosting platform's 15-minute window.
const REMINDER_GRACE = 30 * 60_000;
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);

@Injectable()
export class RosterNoticesService {
  constructor(private readonly db: PrismaService, private readonly pilot: PilotService,
    @Optional() private readonly birthdays?: BirthdayNoticesService) {}

  async list(actor: AuthUser, now = new Date()) {
    const scope = await this.personScope(actor);
    const notices = await this.db.rosterNotice.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, kind: true, title: true, body: true, path: true, createdAt: true, expiresAt: true, declinedAt: true } });
    const inviteIds = notices.filter(notice => notice.kind === "substitute").map(notice => notice.id.split(":")[1]);
    const assignments = inviteIds.length ? await this.db.rosterAssignment.findMany({
      where: { id: { in: inviteIds }, slot: { roster: { churchId: scope.churchId } } },
      select: { id: true, status: true, slot: { select: {
        roster: { select: { status: true, serviceAt: true } },
        assignments: { where: { status: { in: ["PENDING", "CONFIRMED"] } }, select: { substituteForId: true, personId: true, status: true } },
      } } },
    }) : [];
    const byId = new Map(assignments.map(assignment => [assignment.id, assignment]));
    const slotInviteIds = notices.filter(notice => notice.kind === "slot-invite").map(notice => notice.id.slice("slot-invite:".length));
    const slotTable = (this.db as unknown as { rosterSlotInvitation?: { findMany: (args: unknown) => Promise<Array<{ id: string; status: string; expiresAt: Date; slot: { assignments: Array<{ personId: string }>; roster: { status: string; serviceAt: Date } } }>> } }).rosterSlotInvitation;
    const slotInvites = slotInviteIds.length && slotTable?.findMany ? await slotTable.findMany({
      where: { id: { in: slotInviteIds }, churchId: scope.churchId },
      select: { id: true, status: true, expiresAt: true, slot: { select: { assignments: { where: { status: { in: ["PENDING", "CONFIRMED"] } }, select: { personId: true } }, roster: { select: { status: true, serviceAt: true } } } } },
    }) : [];
    const slotById = new Map(slotInvites.map(item => [item.id, item]));
    return {
      notices: notices.map(notice => {
        if (notice.kind === "slot-invite") {
          const invitation = slotById.get(notice.id.slice("slot-invite:".length));
          const roster = invitation?.slot.roster;
          const taken = Boolean(invitation?.slot.assignments.some(row => row.personId !== scope.personId));
          const accepted = invitation?.status === "ACCEPTED";
          const closed = !invitation || !roster || roster.status !== "PUBLISHED" || roster.serviceAt <= now || taken;
          return { ...notice, inviteStatus: accepted ? "accepted" : notice.declinedAt || invitation?.status === "DECLINED" ? "declined" : closed ? "closed" : invitation.expiresAt <= now ? "expired" : "open" };
        }
        if (notice.kind !== "substitute") return notice;
        const assignment = byId.get(notice.id.split(":")[1]);
        const roster = assignment?.slot.roster;
        const confirmed = assignment?.slot.assignments.some(row =>
          row.substituteForId === assignment.id && row.personId === scope.personId && row.status === "CONFIRMED",
        );
        const closed = !roster || roster.status !== "PUBLISHED" || roster.serviceAt <= now ||
          assignment.status !== "DECLINED" || assignment.slot.assignments.length > 0;
        return { ...notice, inviteStatus: confirmed ? "accepted" : notice.declinedAt ? "declined" : closed ? "closed" :
          !notice.expiresAt || notice.expiresAt <= now ? "expired" : "open" };
      }),
      publicKey: this.pushConfig()?.publicKey ?? null,
      testEnabled: process.env.ROSTER_PUSH_TEST_ENABLED === "true",
    };
  }

  async subscribe(actor: AuthUser, input: { endpoint: string; p256dh: string; auth: string }) {
    const scope = await this.personScope(actor);
    if (!this.pushConfig()) throw new ServiceUnavailableException("Notificações push indisponíveis.");
    let endpoint: URL;
    try { endpoint = new URL(input.endpoint); } catch { throw new BadRequestException("Dispositivo inválido."); }
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port || endpoint.hash ||
        (!PUSH_HOSTS.has(endpoint.hostname) && !endpoint.hostname.endsWith(".notify.windows.com"))) {
      throw new BadRequestException("Provedor de notificações não reconhecido.");
    }
    if (!/^[\w-]{87}$/.test(input.p256dh) || !/^[\w-]{22}$/.test(input.auth)) throw new BadRequestException("Chaves do dispositivo inválidas.");
    const data = { ...scope, endpoint: endpoint.href, p256dh: input.p256dh, auth: input.auth };
    await this.db.rosterPushSubscription.upsert({ where: { endpoint: endpoint.href }, create: data, update: data });
    return { subscribed: true };
  }

  async unsubscribe(actor: AuthUser, endpoint: string) {
    const scope = await this.personScope(actor);
    await this.db.rosterPushSubscription.deleteMany({ where: { ...scope, endpoint } });
    return { subscribed: false };
  }

  async acceptSlotInvite(actor: AuthUser, invitationId: string) {
    const pilot = await this.pilot.getPilotChurch();
    return acceptSlotInvitation(this.db, actor, pilot, invitationId);
  }

  async declineSlotInvite(actor: AuthUser, invitationId: string) {
    const pilot = await this.pilot.getPilotChurch();
    return declineSlotInvitation(this.db, actor, pilot, invitationId);
  }

  async acceptInvite(actor: AuthUser, assignmentId: string, now = new Date()) {
    const scope = await this.personScope(actor);
    return writeRosterAssignment(this.db, async tx => {
      const invitation = await tx.rosterNotice.findFirst({ where: { ...scope, id: inviteKey(assignmentId, scope.personId) } });
      if (!invitation) throw new ForbiddenException("Convite indisponível.");
      const assignment = await tx.rosterAssignment.findFirst({
        where: { id: assignmentId, slot: { roster: { churchId: scope.churchId } } }, include: inviteAssignment,
      });
      if (!assignment) throw new ConflictException("Este convite não está mais disponível.");
      const existing = await tx.rosterAssignment.findFirst({ where: { substituteForId: assignmentId, personId: scope.personId, status: "CONFIRMED" } });
      if (existing) return { assignmentId: existing.id, confirmed: true };
      if (invitation.declinedAt) throw new ConflictException("Você já recusou este convite.");
      if (!invitation.expiresAt || invitation.expiresAt <= now) throw new ConflictException("O prazo deste convite terminou.");
      const replacement = await acceptSubstitute(tx, assignment, scope.personId, now);
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "roster.assignment.substitute_invite_accept", resourceType: "roster_assignment",
        resourceId: replacement.id, churchId: scope.churchId, organizationId: assignment.slot.roster.organizationId,
        metadata: { replacedAssignmentId: assignmentId },
      } });
      return { assignmentId: replacement.id, confirmed: true };
    });
  }

  async declineInvite(actor: AuthUser, assignmentId: string, now = new Date()) {
    const scope = await this.personScope(actor);
    return writeRosterAssignment(this.db, async tx => {
      const id = inviteKey(assignmentId, scope.personId);
      const invitation = await tx.rosterNotice.findFirst({ where: { ...scope, id } });
      if (!invitation) throw new ForbiddenException("Convite indisponível.");
      if (invitation.declinedAt) return { declined: true };
      if (!invitation.expiresAt || invitation.expiresAt <= now) throw new ConflictException("O prazo deste convite terminou.");
      const assignment = await tx.rosterAssignment.findFirst({
        where: { id: assignmentId, status: "DECLINED", slot: {
          roster: { churchId: scope.churchId, status: "PUBLISHED", serviceAt: { gt: now } },
          assignments: { none: { status: { in: ["PENDING", "CONFIRMED"] } } },
        } },
        select: { slot: { select: { roster: { select: { organizationId: true } } } } },
      });
      if (!assignment) throw new ConflictException("Este convite já foi encerrado.");
      await tx.rosterNotice.update({ where: { id }, data: { declinedAt: now } });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "roster.assignment.substitute_invite_decline",
        resourceType: "roster_assignment", resourceId: assignmentId,
        churchId: scope.churchId, organizationId: assignment.slot.roster.organizationId,
      } });
      return { declined: true };
    });
  }

  async scheduled(authorization?: string, now = new Date()) {
    const secret = process.env.CRON_SECRET ?? process.env.ROSTER_CRON_SECRET;
    if (process.env.ROSTER_SCHEDULE_ENABLED !== "true" || !secret || secret.length < 32) {
      throw new ServiceUnavailableException("Agendamento indisponível.");
    }
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(authorization ?? ""), digest("Bearer " + secret))) throw new ForbiddenException();
    const roster = await this.run(now);
    const birthdays = await this.birthdays?.runScheduled(now);
    return { ...roster, ...(birthdays ? { birthdays } : {}) };
  }

  async run(now: Date) {
    const { churchId, organizationId } = await this.pilot.getPilotChurch();
    await maintainRosterCycle(this.db as never, { churchId, organizationId }, now);
    const [year, month, day] = churchDayKey(now).split("-").map(Number);
    const surveyMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    const notices: { id: string; churchId: string; personId: string; kind: string; title: string; body: string; path: string }[] = [];
    if (day === 25) {
      const surveyRosters = await this.db.roster.findMany({ where: {
        churchId, organizationId, ministryId: { not: null }, status: { in: ["DRAFT", "PUBLISHED"] },
        serviceAt: { gte: new Date(Date.UTC(year, month, 1, 3)), lt: new Date(Date.UTC(year, month + 1, 1, 3)) },
      }, distinct: ["ministryId", "moduleId"], select: { ministryId: true, moduleId: true, module: { select: { id: true, rules: true } } } });
      const volunteers = await this.db.ministryMembership.findMany({ where: {
        churchId, organizationId, ministryId: { in: [...new Set(surveyRosters.flatMap(item => item.ministryId ? [item.ministryId] : []))] },
        status: "ATIVO", person: { status: "ACTIVE" },
      }, select: { personId: true, ministryId: true } });
      const teams = await volunteerIdsByModule(this.db as never, surveyRosters.flatMap(item => item.moduleId ? [item.moduleId] : []));
      const recipients = new Set(volunteers.filter(volunteer => surveyRosters.some(roster =>
        roster.ministryId === volunteer.ministryId && isModuleVolunteer(rulesWithTeam(roster.module?.rules, roster.moduleId, teams), volunteer.personId),
      )).map(volunteer => volunteer.personId));
      for (const personId of recipients) notices.push({ id: ["survey", churchId, surveyMonth, personId].join(":"), churchId, personId,
        kind: "survey", title: "Pesquisa de serviço aberta", body: "Informe quando você pode servir no próximo mês.", path: PORTAL + "#pesquisa-de-servico" });
    }
    const assignments = await this.db.rosterAssignment.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] },
      slot: { roster: { churchId, organizationId, status: "PUBLISHED", serviceAt: { gt: now } } },
    }, select: { id: true, personId: true, partnerPersonId: true, status: true,
      slot: { select: { roster: { select: { serviceAt: true } } } } } });
    for (const assignment of assignments) {
      for (const personId of [assignment.personId, assignment.partnerPersonId].filter((id): id is string => Boolean(id))) {
        notices.push({ id: ["published", assignment.id, personId].join(":"), churchId, personId, kind: "published",
          title: "Você tem uma nova escala", body: "Consulte sua escala e responda pelo portal.", path: PORTAL });
        const serviceAt = +assignment.slot.roster.serviceAt;
        if (assignment.status === "CONFIRMED" && serviceAt - DAY <= +now && serviceAt - DAY > +now - REMINDER_GRACE) {
          notices.push({ id: ["reminder", assignment.id, serviceAt, personId].join(":"), churchId, personId, kind: "reminder",
            title: "Lembrete da sua escala", body: "Seu culto está próximo. Consulte os detalhes no portal.", path: PORTAL });
        }
      }
    }
    const declined = await this.db.rosterAssignment.findMany({ where: {
      status: "DECLINED", slot: { requiresCouple: false, roster: {
        churchId, organizationId, moduleId: { not: null }, status: "PUBLISHED", serviceAt: { gt: now },
      } },
    }, select: { id: true } });
    let invitations = 0;
    for (const { id } of declined) invitations += await this.inviteNextGroup(churchId, id, now);
    if (leadershipSummaryDue(now)) await this.pushLeadershipSummary(notices, churchId, organizationId, now);
    if (weeklyConfirmationDue(now)) this.pushWeeklyConfirmation(notices, assignments, churchId, now);
    const saved = notices.length ? await this.db.rosterNotice.createMany({
      data: notices.map(notice => ({ ...notice, createdAt: now })), skipDuplicates: true,
    }) : { count: 0 };
    await recordNoticeDeliveries(this.db as never, notices.map(notice => ({ id: notice.id, churchId })), now);
    return { created: saved.count + invitations, invitations, delivered: await this.deliver(churchId, now) };
  }

  private async pushLeadershipSummary(
    notices: { id: string; churchId: string; personId: string; kind: string; title: string; body: string; path: string }[],
    churchId: string,
    organizationId: string,
    now: Date,
  ) {
    const ministries = (this.db as unknown as { ministry?: { findMany: (args: unknown) => Promise<Array<{ leaderPersonId: string | null }>> } }).ministry;
    if (!ministries?.findMany) return;
    const rows = await ministries.findMany({ where: { churchId, organizationId }, select: { leaderPersonId: true } });
    const people = new Set(rows.flatMap(row => row.leaderPersonId ? [row.leaderPersonId] : []));
    const leaders = (this.db as unknown as { ministryRosterModuleLeader?: { findMany: (args: unknown) => Promise<Array<{ personId: string }>> } }).ministryRosterModuleLeader;
    if (leaders?.findMany) {
      for (const link of await leaders.findMany({ where: { churchId }, select: { personId: true } })) people.add(link.personId);
    }
    const day = churchDayKey(now);
    for (const personId of people) {
      notices.push({
        id: ["summary", churchId, day, personId].join(":"), churchId, personId, kind: "summary",
        title: "Resumo da liderança", body: "Veja confirmações, recusas e vagas abertas das escalas.", path: "/app/ministerios/",
      });
    }
  }

  private pushWeeklyConfirmation(
    notices: { id: string; churchId: string; personId: string; kind: string; title: string; body: string; path: string }[],
    assignments: Array<{ status: string; personId: string; partnerPersonId: string | null; slot: { roster: { serviceAt: Date } } }>,
    churchId: string,
    now: Date,
  ) {
    const people = new Set<string>();
    for (const assignment of assignments) {
      if (assignment.status !== "PENDING" || +assignment.slot.roster.serviceAt > +now + 7 * DAY) continue;
      people.add(assignment.personId);
      if (assignment.partnerPersonId) people.add(assignment.partnerPersonId);
    }
    const day = churchDayKey(now);
    for (const personId of people) {
      notices.push({
        id: ["weekly", churchId, day, personId].join(":"), churchId, personId, kind: "weekly",
        title: "Confirme sua escala da semana", body: "Há cultos desta semana ainda sem a sua resposta.", path: PORTAL,
      });
    }
  }

  private async inviteNextGroup(churchId: string, assignmentId: string, now: Date) {
    return writeRosterAssignment(this.db, async tx => {
      const assignment = await tx.rosterAssignment.findFirst({
        where: { id: assignmentId, slot: { roster: { churchId } } }, include: inviteAssignment,
      });
      if (!assignment || assignment.status !== "DECLINED") return 0;
      const { slot } = assignment;
      const rules = readModuleRules(slot.roster.module?.rules);
      const inviteLimit = effectiveInviteLimit(slot.roster.module?.name, slot.roster.module?.rules, rules.substituteInviteLimit);
      if (!inviteLimit || slot.roster.serviceAt <= now) return 0;
      const history = await tx.rosterNotice.findMany({ where: {
        churchId, kind: "substitute", id: { startsWith: inviteKey(assignmentId, "") },
      }, select: { personId: true, expiresAt: true, declinedAt: true } });
      if (history.some(invite => !invite.declinedAt && invite.expiresAt && invite.expiresAt > now)) return 0;
      const invited = new Set(history.map(invite => invite.personId));
      const candidates = (await substitutionCandidates(tx, assignment, now))
        .filter(personId => !invited.has(personId)).slice(0, inviteLimit);
      if (!candidates.length) return 0;
      const expiresAt = new Date(Math.min(+slot.roster.serviceAt, +now + rules.substituteInviteHours * HOUR));
      const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
      const { count } = await tx.rosterNotice.createMany({ data: candidates.map(personId => ({
        id: inviteKey(assignmentId, personId), churchId, personId, kind: "substitute",
        title: "Convite para substituir na escala",
        body: `${slot.roster.title} · ${when.format(slot.roster.serviceAt)}. Responda até ${when.format(expiresAt)}.`,
        path: PORTAL + "#convite-" + assignmentId, createdAt: now, expiresAt,
      })), skipDuplicates: true });
      return count;
    });
  }

  async deviceStatus(actor: AuthUser, endpoint: string) {
    const scope = await this.personScope(actor);
    return { subscribed: Boolean(await this.db.rosterPushSubscription.findFirst({ where: { ...scope, endpoint }, select: { endpoint: true } })) };
  }

  async testDevice(actor: AuthUser, endpoint: string) {
    const scope = await this.personScope(actor);
    const config = this.pushConfig();
    if (!config || process.env.ROSTER_PUSH_TEST_ENABLED !== "true") throw new ForbiddenException("Envio de teste indisponível.");
    const device = await this.db.rosterPushSubscription.findFirst({ where: { ...scope, endpoint } });
    if (!device) throw new BadRequestException("Ative os avisos neste dispositivo primeiro.");
    const delivered = await this.sendPush(device, { id: "roster-push-test", title: "Teste de notificação", body: "Os avisos da escala estão ativos neste dispositivo.", path: PORTAL }, config, 120);
    if (delivered !== "accepted") throw new ServiceUnavailableException("O provedor não aceitou a notificação de teste.");
    return { accepted: true };
  }

  private pushConfig() {
    const { ROSTER_VAPID_PUBLIC_KEY: publicKey, ROSTER_VAPID_PRIVATE_KEY: privateKey, ROSTER_VAPID_SUBJECT: subject } = process.env;
    return publicKey && privateKey && subject && process.env.ROSTER_PUSH_ENABLED === "true" ? { subject, publicKey, privateKey } : null;
  }

  private async sendPush(
    device: { endpoint: string; p256dh: string; auth: string; churchId: string; personId: string },
    payload: { id: string; title: string; body: string; path: string },
    config: NonNullable<ReturnType<RosterNoticesService["pushConfig"]>>,
    ttl: number,
  ) {
    try {
      await webPush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(payload), { TTL: ttl, timeout: 3000, vapidDetails: config });
      return "accepted" as const;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.db.rosterPushSubscription.deleteMany({ where: { endpoint: device.endpoint, churchId: device.churchId, personId: device.personId } });
        return "removed" as const;
      }
      return "retry" as const;
    }
  }

  private async deliver(churchId: string, now: Date) {
    const config = this.pushConfig();
    if (!config) return 0;
    const claimable = { sentAt: null, declinedAt: null, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(+now - 10 * 60_000) } }] };
    const notices = await this.db.rosterNotice.findMany({ where: { churchId, ...claimable,
      createdAt: { gte: new Date(+now - DAY) }, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }], person: { rosterPushSubscriptions: { some: { churchId } } },
    }, orderBy: { createdAt: "asc" }, take: 20 });
    let delivered = 0;
    for (const notice of notices) {
      const claim = await this.db.rosterNotice.updateMany({ where: { id: notice.id, ...claimable }, data: { claimedAt: now } });
      if (!claim.count) continue;
      if (notice.kind === "substitute") {
        const assignment = await this.db.rosterAssignment.findFirst({
          where: { id: notice.id.split(":")[1], slot: { roster: { churchId } } }, include: inviteAssignment,
        });
        if (!notice.expiresAt || notice.expiresAt <= now || !assignment || !(await substitutionCandidates(this.db, assignment, now)).includes(notice.personId)) continue;
      }
      if (notice.kind === "reminder" || notice.kind === "published" || notice.kind === "rescheduled") {
        const assignment = await this.db.rosterAssignment.findFirst({ where: { id: notice.id.split(":")[1], OR: [{ personId: notice.personId }, { partnerPersonId: notice.personId }],
          status: notice.kind === "reminder" ? "CONFIRMED" : { in: ["PENDING", "CONFIRMED"] },
          slot: { roster: { churchId, status: "PUBLISHED", serviceAt: { gt: now,
            ...(notice.kind === "rescheduled" && notice.expiresAt ? { equals: notice.expiresAt } : {}) } } },
        } });
        if (!assignment || (notice.kind === "reminder" && +notice.createdAt < +now - REMINDER_GRACE)) continue;
      }
      const devices = await this.db.rosterPushSubscription.findMany({ where: { churchId, personId: notice.personId } });
      const payload = { id: notice.id, title: notice.title, body: notice.body, path: notice.path };
      const ttl = notice.expiresAt ? Math.min(900, Math.max(1, Math.ceil((+notice.expiresAt - +now) / 1000))) : 900;
      const receipts = new Set(notice.pushReceipts);
      const pending = devices.flatMap(device => {
        const key = createHash("sha256").update(device.endpoint).digest("hex");
        return receipts.has(key) ? [] : [{ device, key }];
      });
      const results = await Promise.all(pending.map(async ({ device, key }) => {
        const status = await this.sendPush(device, payload, config, ttl);
        if (status === "accepted") receipts.add(key);
        return status;
      }));
      await this.db.rosterNotice.update({ where: { id: notice.id }, data: {
        pushReceipts: [...receipts],
        ...(!results.includes("retry") ? { sentAt: now } : {}),
      } });
      if (results.includes("accepted")) delivered++;
    }
    return delivered;
  }

  private async personScope(actor: AuthUser) {
    const { churchId, organizationId } = await this.pilot.getPilotChurch();
    const personId = actor.personId;
    const allowedRoles = [ROLE_CODES.MEMBRO, ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN];
    if (!personId || (actor.churchId && actor.churchId !== churchId) || (actor.organizationId && actor.organizationId !== organizationId) ||
        !actor.grants.some(grant => grantMatchesScope(grant, { roleCodes: allowedRoles, organizationId, churchId }))) {
      throw new ForbiddenException();
    }
    return { churchId, personId };
  }
}
