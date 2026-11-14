import { createHash, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import webPush from "web-push";
import type { AuthUser } from "../auth/types/auth-user";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import { churchDayKey } from "./church-day";
import { writeRosterAssignment } from "./roster-assignment-transaction";
import { readModuleRules } from "./roster-operating-rules";
import { acceptSubstitute, inviteAssignment, inviteKey, substitutionCandidates } from "./roster-substitution-invites";

const PORTAL = "/app/servir/meu-espaco/";
const DAY = 86_400_000;
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);

@Injectable()
export class RosterNoticesService {
  constructor(private readonly db: PrismaService, private readonly pilot: PilotService) {}

  async list(actor: AuthUser) {
    const scope = await this.personScope(actor);
    const notices = await this.db.rosterNotice.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, kind: true, title: true, body: true, path: true, createdAt: true } });
    return { notices, publicKey: process.env.ROSTER_VAPID_PUBLIC_KEY ?? null };
  }

  async subscribe(actor: AuthUser, input: { endpoint: string; p256dh: string; auth: string }) {
    const scope = await this.personScope(actor);
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
    const secret = process.env.ROSTER_CRON_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException("Agendamento indisponível.");
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(authorization ?? ""), digest("Bearer " + secret))) throw new ForbiddenException();
    return this.run(now);
  }

  async run(now: Date) {
    const { churchId, organizationId } = await this.pilot.getPilotChurch();
    const [year, month, day] = churchDayKey(now).split("-").map(Number);
    const surveyMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    const notices = [];
    if (day === 25) {
      const ministries = await this.db.roster.findMany({ where: {
        churchId, organizationId, ministryId: { not: null }, status: { in: ["DRAFT", "PUBLISHED"] },
        serviceAt: { gte: new Date(Date.UTC(year, month, 1, 3)), lt: new Date(Date.UTC(year, month + 1, 1, 3)) },
      }, distinct: ["ministryId"], select: { ministryId: true } });
      const volunteers = await this.db.ministryMembership.findMany({ where: {
        churchId, organizationId, ministryId: { in: ministries.flatMap(item => item.ministryId ? [item.ministryId] : []) },
        status: "ATIVO", person: { status: "ACTIVE" },
      }, distinct: ["personId"], select: { personId: true } });
      for (const { personId } of volunteers) notices.push({ id: ["survey", churchId, surveyMonth, personId].join(":"), churchId, personId,
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
        if (assignment.status === "CONFIRMED" && serviceAt - DAY <= +now && serviceAt - DAY > +now - 15 * 60_000) {
          notices.push({ id: ["reminder", assignment.id, serviceAt, personId].join(":"), churchId, personId, kind: "reminder",
            title: "Lembrete da sua escala", body: "Seu culto está próximo. Consulte os detalhes no portal.", path: PORTAL });
        }
      }
    }
    const declined = await this.db.rosterAssignment.findMany({ where: {
      status: "DECLINED", slot: { requiresCouple: false, roster: {
        churchId, organizationId, moduleId: { not: null }, status: "PUBLISHED", serviceAt: { gt: now },
      } },
    }, include: inviteAssignment });
    for (const assignment of declined) {
      const limit = readModuleRules(assignment.slot.roster.module?.rules).substituteInviteLimit;
      if (!limit) continue;
      const existing = await this.db.rosterNotice.count({ where: {
        churchId, kind: "substitute", id: { startsWith: inviteKey(assignment.id, "") },
      } });
      if (existing) continue;
      const candidates = await substitutionCandidates(this.db, assignment, now);
      for (const personId of candidates.slice(0, limit)) notices.push({
        id: inviteKey(assignment.id, personId), churchId, personId, kind: "substitute",
        title: "Convite para substituir na escala", body: "Há uma vaga na sua equipe. Consulte e responda pelo portal.", path: PORTAL + "#avisos-da-escala",
      });
    }
    const saved = notices.length ? await this.db.rosterNotice.createMany({ data: notices.map(notice => ({ ...notice, createdAt: now })), skipDuplicates: true }) : { count: 0 };
    return { created: saved.count, delivered: await this.deliver(churchId, now) };
  }

  private async deliver(churchId: string, now: Date) {
    const { ROSTER_VAPID_PUBLIC_KEY: publicKey, ROSTER_VAPID_PRIVATE_KEY: privateKey, ROSTER_VAPID_SUBJECT: subject } = process.env;
    if (!publicKey || !privateKey || !subject || process.env.ROSTER_PUSH_ENABLED !== "true") return 0;
    const claimable = { sentAt: null, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(+now - 10 * 60_000) } }] };
    const notices = await this.db.rosterNotice.findMany({ where: { churchId, ...claimable,
      createdAt: { gte: new Date(+now - DAY) }, person: { rosterPushSubscriptions: { some: { churchId } } },
    }, orderBy: { createdAt: "asc" }, take: 20 });
    let delivered = 0;
    for (const notice of notices) {
      const claim = await this.db.rosterNotice.updateMany({ where: { id: notice.id, ...claimable }, data: { claimedAt: now } });
      if (!claim.count) continue;
      if (notice.kind === "substitute") {
        const assignment = await this.db.rosterAssignment.findFirst({
          where: { id: notice.id.split(":")[1], slot: { roster: { churchId } } }, include: inviteAssignment,
        });
        if (!assignment || !(await substitutionCandidates(this.db, assignment, now)).includes(notice.personId)) continue;
      }
      if (notice.kind === "reminder" || notice.kind === "published") {
        const assignment = await this.db.rosterAssignment.findFirst({ where: { id: notice.id.split(":")[1],
          status: notice.kind === "reminder" ? "CONFIRMED" : { in: ["PENDING", "CONFIRMED"] },
          slot: { roster: { status: "PUBLISHED", serviceAt: { gt: now } } },
        } });
        if (!assignment || (notice.kind === "reminder" && +notice.createdAt < +now - 15 * 60_000)) continue;
      }
      const devices = await this.db.rosterPushSubscription.findMany({ where: { churchId, personId: notice.personId }, take: 5 });
      const payload = JSON.stringify({ id: notice.id, title: notice.title, body: notice.body, path: notice.path });
      const results = await Promise.all(devices.map(async device => {
        try {
          await webPush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload,
            { TTL: 900, timeout: 3000, vapidDetails: { subject, publicKey, privateKey } });
          return true;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await this.db.rosterPushSubscription.deleteMany({ where: { endpoint: device.endpoint, churchId, personId: notice.personId } });
          return false;
        }
      }));
      if (results.some(Boolean)) {
        await this.db.rosterNotice.update({ where: { id: notice.id }, data: { sentAt: now } });
        delivered++;
      }
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
