import { ROLE_CODES, hasAccess, type AuthGrant } from "./rbac";
import type { ChurchId, OrganizationId } from "./ids";
import type { MembershipScopeTarget } from "./membership-scope";
import { PILOT_CHURCH_SLUG } from "./pilot";

/**
 * True se algum grant cobre a congregação (papel qualquer).
 * Grant org-wide (churchId null) cobre todas as churches da org.
 * Grant platform-global (organizationId null) cobre qualquer org/church.
 */
export function canAccessChurch(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  if (!grants.length) {
    return false;
  }
  return grants.some((grant) => {
    if (grant.organizationId && grant.organizationId !== target.organizationId) {
      return false;
    }
    if (grant.churchId && grant.churchId !== target.churchId) {
      return false;
    }
    return true;
  });
}

/** PLATFORM_ADMIN com escopo na org (church null = org-wide) ou global. */
export function isPlatformAdminInOrg(
  grants: AuthGrant[],
  organizationId: OrganizationId,
): boolean {
  return hasAccess(grants, {
    roleCodes: [ROLE_CODES.PLATFORM_ADMIN],
    organizationId,
  });
}

/**
 * Leitura de auditoria no escopo:
 * - SECRETARIA / PASTOR na church; ou
 * - PLATFORM_ADMIN na org (cross-church).
 */
export function canReadAudit(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return (
    hasAccess(grants, {
      roleCodes: [ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR],
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

/** Orgs distintas presentes nos grants (null = plataforma → omitido). */
export function organizationIdsFromGrants(grants: AuthGrant[]): string[] {
  const ids = new Set<string>();
  for (const g of grants) {
    if (g.organizationId) {
      ids.add(g.organizationId);
    }
  }
  return [...ids];
}

/**
 * Church IDs explicitamente listados nos grants (church-scoped).
 * Grants org-wide não entram aqui — o caller lista churches da org no DB.
 */
export function explicitChurchIdsFromGrants(
  grants: AuthGrant[],
  organizationId?: OrganizationId,
): string[] {
  const ids = new Set<string>();
  for (const g of grants) {
    if (organizationId && g.organizationId && g.organizationId !== organizationId) {
      continue;
    }
    if (g.churchId) {
      ids.add(g.churchId);
    }
  }
  return [...ids];
}

/** True se há grant org-wide (churchId null/undefined) na org. */
export function hasOrgWideGrant(
  grants: AuthGrant[],
  organizationId: OrganizationId,
): boolean {
  return grants.some(
    (g) =>
      (!g.organizationId || g.organizationId === organizationId) && !g.churchId,
  );
}

export interface ActiveChurchContext {
  organizationId: OrganizationId | null;
  churchId: ChurchId | null;
}

/**
 * Escolhe contexto ativo no login:
 * 1) piloto RF1 se grant cobre; 2) primeiro churchId dos grants; 3) org + piloto.
 */
export function resolveDefaultActiveContext(
  grants: AuthGrant[],
  pilot: { organizationId: string; churchId: string; churchSlug?: string },
): ActiveChurchContext {
  if (!grants.length) {
    return { organizationId: null, churchId: null };
  }

  if (
    canAccessChurch(grants, {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    })
  ) {
    return {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    };
  }

  const explicit = explicitChurchIdsFromGrants(grants);
  if (explicit.length > 0) {
    const churchId = explicit[0]!;
    const grant = grants.find((g) => g.churchId === churchId);
    return {
      organizationId: grant?.organizationId ?? pilot.organizationId,
      churchId,
    };
  }

  const orgs = organizationIdsFromGrants(grants);
  if (orgs.length > 0) {
    return { organizationId: orgs[0]!, churchId: pilot.churchId };
  }

  // Grant plataforma sem org — default piloto
  return {
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
  };
}

/** Slug canônico do piloto — útil em docs/mobile. */
export const DEFAULT_PRODUCT_CHURCH_SLUG = PILOT_CHURCH_SLUG;
