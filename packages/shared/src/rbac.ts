import type { ChurchId, OrganizationId, RoleCode } from "./ids";

/** Papéis base do skeleton F1 (alinhados aos atores do DAS). */
export const ROLE_CODES = {
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
  SECRETARIA: "SECRETARIA",
  PASTOR: "PASTOR",
  TESOURARIA: "TESOURARIA",
  LIDER_MINISTERIO: "LIDER_MINISTERIO",
  MEMBRO: "MEMBRO",
} as const;

export type BuiltInRoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export interface GrantScope {
  organizationId?: OrganizationId | null;
  churchId?: ChurchId | null;
  /** Escopo de ministério (LIDER_MINISTERIO). Null = church-wide se o papel permitir. */
  ministryId?: string | null;
}

export interface AuthGrant extends GrantScope {
  roleCode: RoleCode;
}

export interface AccessCheck {
  roleCodes: RoleCode[];
  organizationId?: OrganizationId | null;
  churchId?: ChurchId | null;
  ministryId?: string | null;
}

/**
 * Grant cobre o escopo pedido se:
 * - papel bate; e
 * - grant sem org = global na organização implícita do token / plataforma; e
 * - grant com org exige match; church opcional (grant sem church cobre toda a org);
 * - se `required.ministryId` e o grant tem `ministryId`, devem bater
 *   (grant sem ministryId cobre a igreja inteira para aquele papel).
 */
export function grantMatchesScope(
  grant: AuthGrant,
  required: AccessCheck,
): boolean {
  if (!required.roleCodes.includes(grant.roleCode)) {
    return false;
  }

  if (grant.organizationId) {
    if (!required.organizationId || grant.organizationId !== required.organizationId) {
      return false;
    }
  }

  if (grant.churchId) {
    if (!required.churchId || grant.churchId !== required.churchId) {
      return false;
    }
  }

  // Ministry scope só restringe quando o check pede ministryId.
  // Grant com ministryId ainda satisfaz checks church-wide do mesmo papel.
  if (required.ministryId && grant.ministryId) {
    if (grant.ministryId !== required.ministryId) {
      return false;
    }
  }

  return true;
}

/** True se algum grant do usuário satisfaz o acesso pedido. */
export function hasAccess(grants: AuthGrant[], required: AccessCheck): boolean {
  return grants.some((grant) => grantMatchesScope(grant, required));
}
