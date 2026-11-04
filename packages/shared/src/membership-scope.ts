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
