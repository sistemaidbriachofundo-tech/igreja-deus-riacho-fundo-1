import { ForbiddenException } from "@nestjs/common";
import { canAdministerMinistries, type AuthGrant } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import type { PilotScope } from "../common/ministry-access";

const PARTICIPATION_ROLES = [
  "SECRETARIA",
  "PASTOR",
  "PLATFORM_ADMIN",
  "LIDER_MINISTERIO",
] as const;

const MEMBERSHIP_ROLES = ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] as const;

export function assertParticipationAccess(
  actor: AuthUser,
  pilot: PilotScope,
): void {
  assertRole(actor, pilot, PARTICIPATION_ROLES, "Sem permissão para o relatório de participação");
}

export function assertMembershipAccess(
  actor: AuthUser,
  pilot: PilotScope,
): void {
  assertRole(actor, pilot, MEMBERSHIP_ROLES, "Sem permissão para o relatório de membresia");
}

export function assertMinisterialAccess(
  actor: AuthUser,
  pilot: PilotScope,
): void {
  assertRole(actor, pilot, PARTICIPATION_ROLES, "Sem permissão para o relatório ministerial");
}

/**
 * `null` = secretaria, pastor ou admin veem a congregação.
 * Lista = só os ministérios do líder. Lista vazia não abre os demais.
 */
export function ministryScopeIds(
  actor: AuthUser,
  pilot: PilotScope,
): string[] | null {
  if (canAdministerMinistries(actor.grants, pilot)) {
    return null;
  }
  return actor.grants
    .filter(
      (grant) =>
        grant.roleCode === "LIDER_MINISTERIO" &&
        grantCoversPilot(grant, pilot) &&
        typeof grant.ministryId === "string" &&
        grant.ministryId.length > 0,
    )
    .map((grant) => grant.ministryId as string);
}

export function eventVisibleToScope(
  ministryId: string | null,
  scope: string[] | null,
): boolean {
  if (scope === null) return true;
  return ministryId !== null && scope.includes(ministryId);
}

function assertRole(
  actor: AuthUser,
  pilot: PilotScope,
  roles: readonly string[],
  message: string,
): void {
  const allowed = actor.grants.some(
    (grant) => roles.includes(grant.roleCode) && grantCoversPilot(grant, pilot),
  );
  if (!allowed) {
    throw new ForbiddenException(message);
  }
}

function grantCoversPilot(grant: AuthGrant, pilot: PilotScope): boolean {
  if (grant.organizationId && grant.organizationId !== pilot.organizationId) {
    return false;
  }
  if (grant.churchId && grant.churchId !== pilot.churchId) {
    return false;
  }
  return true;
}
