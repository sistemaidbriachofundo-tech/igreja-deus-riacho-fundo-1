import { ROLE_CODES, hasAccess, type AuthGrant } from "./rbac";
import type { ChurchId, OrganizationId } from "./ids";

export interface MembershipScopeTarget {
  organizationId: OrganizationId;
  churchId: ChurchId;
}

/**
 * Secretaria (ou platform admin) pode operar membresia/carteirinha
 * somente no escopo da congregação alvo.
 */
export function canManageMemberships(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return (
    hasAccess(grants, {
      roleCodes: [ROLE_CODES.SECRETARIA],
      organizationId: target.organizationId,
      churchId: target.churchId,
    }) ||
    hasAccess(grants, {
      roleCodes: [ROLE_CODES.PLATFORM_ADMIN],
      organizationId: target.organizationId,
      churchId: target.churchId,
    })
  );
}

/** Membro só vê a própria carteirinha (titularidade por person_id). */
export function canViewOwnCredential(
  actorPersonId: string,
  credentialPersonId: string,
): boolean {
  return actorPersonId === credentialPersonId;
}

/** Secretaria / admin operam protocolos de admissão no escopo. */
export function canManageAdmissions(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return canManageMemberships(grants, target);
}

/** Aprovação pastoral na etapa pastor. */
export function canApprovePastoralAdmission(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return (
    hasAccess(grants, {
      roleCodes: [ROLE_CODES.PASTOR],
      organizationId: target.organizationId,
      churchId: target.churchId,
    }) ||
    hasAccess(grants, {
      roleCodes: [ROLE_CODES.PLATFORM_ADMIN],
      organizationId: target.organizationId,
      churchId: target.churchId,
    })
  );
}

/** Busca de pessoas (dedupe assistida) — secretaria/pastor/admin. */
export function canSearchPersons(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return (
    canManageMemberships(grants, target) ||
    canApprovePastoralAdmission(grants, target)
  );
}
