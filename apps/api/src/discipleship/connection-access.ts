import { ForbiddenException } from "@nestjs/common";
import { grantMatchesScope, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import type { PrismaService } from "../prisma/prisma.service";

export type ConnectionScope = { organizationId: string; churchId: string };

export async function canManageConnection(db: Pick<PrismaService, "ministry">, actor: AuthUser, scope: ConnectionScope): Promise<boolean> {
  if ((actor.organizationId && actor.organizationId !== scope.organizationId) ||
      (actor.churchId && actor.churchId !== scope.churchId)) return false;
  if (actor.grants.some(grant => !grant.ministryId && grantMatchesScope(grant, {
    ...scope, roleCodes: [ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN],
  }))) return true;
  const leaders = actor.grants.filter(grant => grantMatchesScope(grant, {
    ...scope, roleCodes: [ROLE_CODES.LIDER_MINISTERIO],
  }));
  if (!leaders.length) return false;
  const ministry = await db.ministry?.findFirst({
    where: { organizationId: scope.organizationId, churchId: scope.churchId, slug: "conexao" },
    select: { id: true, leaderPersonId: true },
  });
  return Boolean(ministry && leaders.some(grant =>
    grant.ministryId ? grant.ministryId === ministry.id : ministry.leaderPersonId === actor.personId,
  ));
}

export async function requireConnectionManagement(
  db: Pick<PrismaService, "ministry">,
  actor: AuthUser,
  scope: ConnectionScope,
) {
  if (!(await canManageConnection(db, actor, scope))) {
    throw new ForbiddenException("A gestão da Conexão é reservada à liderança da Conexão, ao pastor e à administração da congregação.");
  }
}
