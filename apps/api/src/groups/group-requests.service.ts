import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class GroupRequestsService {
  constructor(private readonly db: PrismaService, private readonly pilot: PilotService) {}

  private async scope(actor: AuthUser) {
    const { organizationId, churchId } = await this.pilot.getPilotChurch();
    const scope = { organizationId, churchId };
    if ((actor.organizationId && actor.organizationId !== organizationId) ||
        (actor.churchId && actor.churchId !== churchId) ||
        !hasAccess(actor.grants, { ...scope, roleCodes: Object.values(ROLE_CODES) })) throw new ForbiddenException();
    return scope;
  }

  async catalog(actor: AuthUser) {
    const scope = await this.scope(actor);
    const groups = await this.db.smallGroup.findMany({
      where: { ...scope, leaderPersonId: { not: null } }, orderBy: { name: "asc" },
      select: { id: true, name: true, meetsAtHint: true, leaderPersonId: true,
        photoUrl: true, publicListed: true, meetingAddress: true, leader: { select: { displayName: true } },
        members: { where: { personId: actor.personId }, select: { id: true } },
        joinRequests: { where: { personId: actor.personId }, select: { status: true } } },
    });
    return { groups: groups.map(group => {
      const leads = group.leaderPersonId === actor.personId;
      const belongs = leads || group.members.length > 0;
      return {
        id: group.id, name: group.name, meetsAtHint: group.meetsAtHint, photoUrl: group.photoUrl,
        leaderName: group.leader?.displayName ?? null, leads,
        meetingAddress: belongs || group.publicListed ? group.meetingAddress : null,
        status: belongs ? "MEMBER" : group.joinRequests[0]?.status ?? null,
      };
    }) };
  }

  async request(actor: AuthUser, groupId: string) {
    const scope = await this.scope(actor);
    const person = await this.db.person.findFirst({
      where: { id: actor.personId, organizationId: scope.organizationId, status: "ACTIVE",
        OR: [{ homeChurchId: scope.churchId }, { memberships: { some: { ...scope, status: "ACTIVE" } } }] }, select: { id: true },
    });
    if (!person) throw new ForbiddenException("O cadastro precisa estar ativo na congregação.");
    const group = await this.db.smallGroup.findFirst({
      where: { ...scope, id: groupId, leaderPersonId: { not: null } },
      select: { leaderPersonId: true, members: { where: { personId: person.id }, select: { id: true } } },
    });
    if (!group) throw new NotFoundException("Grupo indisponível.");
    if (group.leaderPersonId === person.id || group.members.length) return { status: "MEMBER" };
    await this.db.smallGroupJoinRequest.createMany({ data: [{ groupId, personId: person.id }], skipDuplicates: true });
    const row = await this.db.smallGroupJoinRequest.findUnique({
      where: { groupId_personId: { groupId, personId: person.id } }, select: { status: true },
    });
    if (!row) throw new NotFoundException("Pedido indisponível.");
    return row;
  }

  async inbox(actor: AuthUser, since?: Date) {
    const scope = await this.scope(actor);
    if (!actor.personId || !hasAccess(actor.grants, { ...scope,
      roleCodes: [ROLE_CODES.MEMBRO, ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN] })) return [];
    return this.db.smallGroupJoinRequest.findMany({
      where: { group: { ...scope, leaderPersonId: actor.personId },
        ...(since ? { OR: [{ status: "PENDING" }, { createdAt: { gte: since } }] } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 50,
      select: { id: true, status: true, createdAt: true,
        group: { select: { name: true } }, person: { select: { displayName: true } } },
    });
  }

  async decide(actor: AuthUser, id: string, approved: boolean) {
    const scope = await this.scope(actor);
    if (!actor.personId || !hasAccess(actor.grants, { ...scope,
      roleCodes: [ROLE_CODES.MEMBRO, ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.PASTOR, ROLE_CODES.SECRETARIA, ROLE_CODES.PLATFORM_ADMIN] })) throw new ForbiddenException();
    return this.db.$transaction(async tx => {
      const row = await tx.smallGroupJoinRequest.findFirst({
        where: { id, group: { ...scope, leaderPersonId: actor.personId } },
        select: { groupId: true, personId: true, person: { select: { status: true } } },
      });
      if (!row) throw new NotFoundException("Pedido indisponível.");
      if (approved && row.person.status !== "ACTIVE") throw new ConflictException("O cadastro desta pessoa está inativo.");
      const status = approved ? "APPROVED" : "DECLINED";
      const result = await tx.smallGroupJoinRequest.updateMany({
        where: { id, status: "PENDING", group: { ...scope, leaderPersonId: actor.personId } }, data: { status },
      });
      if (!result.count) throw new ConflictException("Este pedido já foi analisado.");
      if (approved) await tx.smallGroupMember.createMany({
        data: [{ groupId: row.groupId, personId: row.personId }], skipDuplicates: true,
      });
      await tx.auditLog.create({ data: { ...scope, actorUserId: actor.userId,
        action: "small_group.join_request.decide", resourceType: "small_group_join_request", resourceId: id, metadata: { status } } });
      return { status };
    });
  }
}
