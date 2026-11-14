import { createHash, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import webPush from "web-push";
import type { AuthUser } from "../auth/types/auth-user";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import { churchDayKey } from "./church-day";
import { writeRosterAssignment } from "./roster-assignment-transaction";
import { isModuleVolunteer, readModuleRules } from "./roster-operating-rules";
import { acceptSubstitute, inviteAssignment, inviteKey, substitutionCandidates } from "./roster-substitution-invites";

const PORTAL = "/app/servir/meu-espaco/";
const DAY = 86_400_000;
const HOUR = 3_600_000;
// A periodic run can land at either end of the hosting platform's 15-minute window.
const REMINDER_GRACE = 30 * 60_000;
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);

@Injectable()
export class RosterNoticesService {
  constructor(private readonly db: PrismaService, private readonly pilot: PilotService) {}

  async list(actor: AuthUser, now = new Date()) {
    const scope = await this.personScope(actor);
    const notices = await this.db.rosterNotice.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, kind: true, title: true, body: true, path: true, createdAt: true, expiresAt: true } });
    const inviteIds = notices.filter(notice => notice.kind === "substitute").map(notice => notice.id.split(":")[1]);
    const assignments = inviteIds.length ? await this.db.rosterAssignment.findMany({
      where: { id: { in: inviteIds }, slot: { roster: { churchId: scope.churchId } } },
      select: { id: true, status: true, slot: { select: {
        roster: { select: { status: true, serviceAt: true } },
        assignments: { where: { status: { in: ["PENDING", "CONFIRMED"] } }, select: { substituteForId: true, personId: true, status: true } },
      } } },
    }) : [];
    const byId = new Map(assignments.map(assignment => [assignment.id, assignment]));
    return {
      notices: notices.map(notice => {
        if (notice.kind !== "substitute") return notice;
        const assignment = byId.get(notice.id.split(":")[1]);
        const roster = assignment?.slot.roster;
        const confirmed = assignment?.slot.assignments.some(row =>
          row.substituteForId === assignment.id && row.personId === scope.personId && row.status === "CONFIRMED",
        );
        const closed = !roster || roster.status !== "PUBLISHED" || roster.serviceAt <= now ||
          assignment.status !== "DECLINED" || assignment.slot.assignments.length > 0;
        return { ...notice, inviteStatus: confirmed ? "accepted" : closed ? "closed" :
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

  async scheduled(authorization?: string, now = new Date()) {
    const secret = process.env.CRON_SECRET ?? process.env.ROSTER_CRON_SECRET;
    if (process.env.ROSTER_SCHEDULE_ENABLED !== "true" || !secret || secret.length < 32) {
      throw new ServiceUnavailableException("Agendamento indisponível.");
    }
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(authorization ?? ""), digest("Bearer " + secret))) throw new ForbiddenException();
    return this.run(now);
  }

  async run(now: Date) {
    const { churchId, organizationId } = await this.pilot.getPilotChurch();
    const [year, month, day] = churchDayKey(now).split("-").map(Number);
    const surveyMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    const notices: { id: string; churchId: string; personId: string; kind: string; title: string; body: string; path: string }[] = [];
    if (day === 25) {
      const surveyRosters = await this.db.roster.findMany({ where: {
        churchId, organizationId, ministryId: { not: null }, status: { in: ["DRAFT", "PUBLISHED"] },
        serviceAt: { gte: new Date(Date.UTC(year, month, 1, 3)), lt: new Date(Date.UTC(year, month + 1, 1, 3)) },
      }, distinct: ["ministryId", "moduleId"], select: { ministryId: true, module: { select: { rules: true } } } });
      const volunteers = await this.db.ministryMembership.findMany({ where: {
        churchId, organizationId, ministryId: { in: [...new Set(surveyRosters.flatMap(item => item.ministryId ? [item.ministryId] : []))] },
        status: "ATIVO", person: { status: "ACTIVE" },
      }, select: { personId: true, ministryId: true } });
      const recipients = new Set(volunteers.filter(volunteer => surveyRosters.some(roster =>
        roster.ministryId === volunteer.ministryId && isModuleVolunteer(readModuleRules(roster.module?.rules), volunteer.personId),
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
    const saved = notices.length ? await this.db.rosterNotice.createMany({
      data: notices.map(notice => ({ ...notice, createdAt: now })), skipDuplicates: true,
    }) : { count: 0 };
    return { created: saved.count + invitations, invitations, delivered: await this.deliver(churchId, now) };
  }

  private async inviteNextGroup(churchId: string, assignmentId: string, now: Date) {
    return writeRosterAssignment(this.db, async tx => {
      const assignment = await tx.rosterAssignment.findFirst({
        where: { id: assignmentId, slot: { roster: { churchId } } }, include: inviteAssignment,
      });
      if (!assignment || assignment.status !== "DECLINED") return 0;
      const { slot } = assignment;
      const rules = readModuleRules(slot.roster.module?.rules);
      if (!rules.substituteInviteLimit || slot.roster.serviceAt <= now) return 0;
      const history = await tx.rosterNotice.findMany({ where: {
        churchId, kind: "substitute", id: { startsWith: inviteKey(assignmentId, "") },
      }, select: { personId: true, expiresAt: true } });
      if (history.some(invite => invite.expiresAt && invite.expiresAt > now)) return 0;
      const invited = new Set(history.map(invite => invite.personId));
      const candidates = (await substitutionCandidates(tx, assignment, now))
        .filter(personId => !invited.has(personId)).slice(0, rules.substituteInviteLimit);
      if (!candidates.length) return 0;
      const expiresAt = new Date(Math.min(+slot.roster.serviceAt, +now + rules.substituteInviteHours * HOUR));
      const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
      const { count } = await tx.rosterNotice.createMany({ data: candidates.map(personId => ({
        id: inviteKey(assignmentId, personId), churchId, personId, kind: "substitute",
        title: "Convite para substituir na escala",
        body: `${slot.roster.title} · ${when.format(slot.roster.serviceAt)}. Responda até ${when.format(expiresAt)}.`,
        path: PORTAL + "#avisos-da-escala", createdAt: now, expiresAt,
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
    const claimable = { sentAt: null, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(+now - 10 * 60_000) } }] };
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
      if (notice.kind === "reminder" || notice.kind === "published") {
        const assignment = await this.db.rosterAssignment.findFirst({ where: { id: notice.id.split(":")[1], OR: [{ personId: notice.personId }, { partnerPersonId: notice.personId }],
          status: notice.kind === "reminder" ? "CONFIRMED" : { in: ["PENDING", "CONFIRMED"] },
          slot: { roster: { churchId, status: "PUBLISHED", serviceAt: { gt: now } } },
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
    if (!personId || !actor.grants.some(grant => grant.organizationId === organizationId && grant.churchId === churchId)) throw new ForbiddenException();
    return { churchId, personId };
  }
}
