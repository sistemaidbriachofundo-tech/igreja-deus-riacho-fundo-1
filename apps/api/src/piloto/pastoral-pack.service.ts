import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { credentialColorRule, officeDocumentKind, ROLE_CODES, saoPauloParts } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { PrivateStorageService } from "../storage/private-storage.service";
import { assertChurchRole, assertOperationalScope } from "./church";

const PASTORAL = [ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN];
const BELL = "Há um pedido de oração";

@Injectable()
export class PastoralPackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly storage: PrivateStorageService,
  ) {}

  async dashboard(actor: AuthUser, now = new Date()) {
    const pilot = await this.scoped(actor);
    const today = saoPauloParts(now).date;
    const [members, admissions, prayers, people, services] = await Promise.all([
      this.prisma.churchMembership.count({ where: { churchId: pilot.churchId, status: "ACTIVE" } }),
      this.prisma.admissionProtocol.count({
        where: { churchId: pilot.churchId, status: { in: ["DRAFT", "AWAITING_DOCUMENTS", "AWAITING_SECRETARIA", "AWAITING_PASTOR"] } },
      }),
      this.prisma.prayerRequest.count({ where: { churchId: pilot.churchId, status: "OPEN" } }),
      this.prisma.person.findMany({
        where: {
          organizationId: pilot.organizationId, status: "ACTIVE", birthDate: { not: null },
          OR: [{ homeChurchId: pilot.churchId }, { memberships: { some: { churchId: pilot.churchId, status: "ACTIVE" } } }],
        },
        select: { birthDate: true },
      }),
      this.prisma.serviceOrder.count({ where: { churchId: pilot.churchId, status: "PUBLISHED", serviceAt: { gte: now } } }),
    ]);
    const birthdaysToday = people.filter(person => person.birthDate && person.birthDate.toISOString().slice(5, 10) === today.slice(5)).length;
    return { churchId: pilot.churchId, today, members, pendingAdmissions: admissions, openPrayers: prayers, birthdaysToday, upcomingServices: services };
  }

  async createPrayer(actor: AuthUser, input: { body: string; responsibleUserId: string; substituteUserId?: string | null }) {
    const pilot = await this.scoped(actor, [ROLE_CODES.MEMBRO, ROLE_CODES.CONVIDADO, ...PASTORAL]);
    const body = input.body?.trim() ?? "";
    if (body.length < 2 || body.length > 2000) throw new BadRequestException("Escreva o pedido entre 2 e 2000 caracteres.");
    const responsible = await this.pastorUser(pilot, input.responsibleUserId);
    const substitute = input.substituteUserId ? await this.pastorUser(pilot, input.substituteUserId) : null;
    if (substitute && substitute.id === responsible.id) throw new BadRequestException("O substituto é outra pessoa.");
    const pastors = await this.prisma.user.findMany({
      where: { status: "ACTIVE", grants: { some: { role: { code: ROLE_CODES.PASTOR }, churchId: pilot.churchId } } },
      select: { id: true },
    });
    const recipients = [...new Set([responsible.id, substitute?.id, ...pastors.map(pastor => pastor.id)].filter((id): id is string => Boolean(id)))];
    const created = await this.prisma.$transaction(async tx => {
      const request = await tx.prayerRequest.create({
        data: {
          organizationId: pilot.organizationId, churchId: pilot.churchId, body, status: "OPEN",
          responsibleUserId: responsible.id, substituteUserId: substitute?.id ?? null, submittedByPersonId: actor.personId,
        },
      });
      await tx.prayerBell.createMany({ data: recipients.map(recipientUserId => ({ requestId: request.id, recipientUserId })) });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId, action: "prayer.created", resourceType: "prayer_request", resourceId: request.id,
          organizationId: pilot.organizationId, churchId: pilot.churchId, metadata: { recipients: recipients.length },
        },
      });
      return request;
    });
    return { id: created.id, status: created.status, notified: recipients.length };
  }

  async listPrayers(actor: AuthUser) {
    const pilot = await this.scoped(actor);
    const rows = await this.prisma.prayerRequest.findMany({
      where: { churchId: pilot.churchId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, responsibleUserId: true, substituteUserId: true },
    });
    return {
      requests: rows.map(row => ({
        id: row.id, status: row.status, createdAt: row.createdAt.toISOString(),
        canReadText: row.responsibleUserId === actor.userId || row.substituteUserId === actor.userId,
      })),
    };
  }

  async readPrayer(actor: AuthUser, requestId: string) {
    const pilot = await this.scoped(actor);
    const row = await this.prisma.prayerRequest.findFirst({ where: { id: requestId, churchId: pilot.churchId } });
    if (!row) throw new NotFoundException("Pedido não encontrado.");
    if (row.responsibleUserId !== actor.userId && row.substituteUserId !== actor.userId) {
      throw new ForbiddenException("O texto fica com o pastor responsável ou o substituto autorizado.");
    }
    return { id: row.id, status: row.status, body: row.body, createdAt: row.createdAt.toISOString() };
  }

  async bells(actor: AuthUser) {
    const pilot = await this.scoped(actor);
    const rows = await this.prisma.prayerBell.findMany({
      where: { recipientUserId: actor.userId, request: { churchId: pilot.churchId } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, readAt: true },
    });
    return { notices: rows.map(row => ({ id: row.id, title: BELL, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null })) };
  }

  async readBell(actor: AuthUser, bellId: string) {
    const updated = await this.prisma.prayerBell.updateMany({
      where: { id: bellId, recipientUserId: actor.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { id: bellId, read: updated.count === 1 || true };
  }

  async associations(actor: AuthUser, personId: string) {
    const pilot = await this.scoped(actor, [...PASTORAL, ROLE_CODES.LIDER_MINISTERIO]);
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: pilot.organizationId, OR: [{ homeChurchId: pilot.churchId }, { memberships: { some: { churchId: pilot.churchId } } }] },
      select: { id: true },
    });
    if (!person) throw new NotFoundException("Pessoa não encontrada nesta congregação.");
    const [tracks, groups, bindings] = await Promise.all([
      this.prisma.discipleshipEnrollment.findMany({
        where: { personId, status: "ACTIVE", track: { churchId: pilot.churchId } },
        select: { trackId: true, mentorPersonId: true, track: { select: { name: true } } },
      }),
      this.prisma.smallGroupMember.findMany({
        where: { personId, group: { churchId: pilot.churchId } },
        select: { role: true, groupId: true, group: { select: { name: true } } },
      }),
      this.bindings(actor),
    ]);
    for (const track of tracks) assertOperationalScope(actor, bindings, "TRACK", track.trackId);
    for (const group of groups) assertOperationalScope(actor, bindings, "GROUP", group.groupId);
    return {
      personId,
      exclusiveTrack: tracks.length === 1,
      tracks: tracks.map(track => ({ trackId: track.trackId, name: track.track.name, mentorPersonId: track.mentorPersonId })),
      groups: groups.map(group => ({ groupId: group.groupId, name: group.group.name, role: group.role })),
    };
  }

  async saveDossierFile(actor: AuthUser, personId: string, input: { fileName: string; contentType: string; contentBase64: string }) {
    const pilot = await this.scoped(actor, [ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN]);
    await this.associations(actor, personId);
    const bytes = Buffer.from(input.contentBase64 ?? "", "base64");
    const kind = officeDocumentKind(bytes, input.contentType ?? "");
    if (!kind) throw new BadRequestException("Envie um DOC ou DOCX válido.");
    const storageKey = `dossier/${pilot.organizationId}/${pilot.churchId}/${personId}/${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}.${kind}`;
    await this.storage.put(storageKey, bytes);
    const saved = await this.prisma.personDossierFile.create({
      data: {
        organizationId: pilot.organizationId, churchId: pilot.churchId, personId,
        fileName: input.fileName.trim().slice(0, 180) || `ficha.${kind}`,
        contentType: input.contentType, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
        storageKey, uploadedByUserId: actor.userId,
      },
    });
    return { id: saved.id, fileName: saved.fileName, contentType: saved.contentType, byteSize: saved.byteSize };
  }

  async credentialColor(actor: AuthUser, membershipId: string) {
    const pilot = await this.scoped(actor, [ROLE_CODES.MEMBRO, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN]);
    const membership = await this.prisma.churchMembership.findFirst({
      where: { id: membershipId, churchId: pilot.churchId, organizationId: pilot.organizationId },
      select: { status: true, ecclesiasticalRoles: true, personId: true },
    });
    if (!membership) throw new NotFoundException("Vínculo não encontrado.");
    const own = actor.personId === membership.personId;
    const staff = actor.grants.some(grant => grant.roleCode === ROLE_CODES.SECRETARIA || grant.roleCode === ROLE_CODES.PASTOR || grant.roleCode === ROLE_CODES.PLATFORM_ADMIN);
    if (!own && !staff) throw new ForbiddenException("A carteira colorida fica com a pessoa ou com a Secretaria.");
    return credentialColorRule({ status: membership.status, roles: membership.ecclesiasticalRoles });
  }

  private async scoped(actor: AuthUser, roles: readonly string[] = PASTORAL) {
    const pilot = await this.pilot.getPilotChurch();
    assertChurchRole(actor, pilot, roles);
    return pilot;
  }

  private async pastorUser(pilot: { organizationId: string; churchId: string }, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: "ACTIVE", grants: { some: { role: { code: ROLE_CODES.PASTOR }, organizationId: pilot.organizationId, churchId: pilot.churchId } } },
      select: { id: true },
    });
    if (!user) throw new BadRequestException("O pastor responsável precisa ter acesso pastoral nesta congregação.");
    return user;
  }

  private async bindings(actor: AuthUser) {
    const grantIds = actor.grants.map(grant => ("id" in grant ? String((grant as { id?: string }).id ?? "") : "")).filter(Boolean);
    if (!grantIds.length) return [];
    return this.prisma.accessScopeBinding.findMany({ where: { grantId: { in: grantIds } }, select: { kind: true, scopeId: true } });
  }
}
