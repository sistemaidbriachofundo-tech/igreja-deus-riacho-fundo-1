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

/**
 * Canais F5 (templates/outbox/consentimento) — secretaria, pastor ou admin.
 * Sem WABA live; só operação administrativa do outbox.
 */
export function canManageChannels(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return (
    canManageMemberships(grants, target) ||
    canApprovePastoralAdmission(grants, target)
  );
}

/** Transferência e cartas oficiais — secretaria/admin no escopo. */
export function canManageTransfers(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return canManageMemberships(grants, target);
}

/**
 * Casos pastorais: só PASTOR no escopo.
 * SECRETARIA e PLATFORM_ADMIN NÃO leem por padrão (sigilo DAS).
 */
export function canAccessPastoralCare(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return hasAccess(grants, {
    roleCodes: [ROLE_CODES.PASTOR],
    organizationId: target.organizationId,
    churchId: target.churchId,
  });
}

/** Ministérios / escalas / células — líder, secretaria, pastor ou admin (church-wide). */
export function canLeadMinistry(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return (
    canManageMemberships(grants, target) ||
    canApprovePastoralAdmission(grants, target) ||
    hasAccess(grants, {
      roleCodes: [ROLE_CODES.LIDER_MINISTERIO],
      organizationId: target.organizationId,
      churchId: target.churchId,
    })
  );
}

export interface MinistryScopeTarget extends MembershipScopeTarget {
  ministryId: string;
  leaderPersonId?: string | null;
}

/**
 * Opera um ministério específico:
 * - secretaria / pastor / platform admin no escopo da igreja; ou
 * - LIDER_MINISTERIO com grant.ministryId == ministry; ou
 * - personId do ator == leaderPersonId do ministério (e papel LIDER na igreja).
 *
 * LIDER sem ministryId no grant NÃO opera todos os ministérios.
 */
export function canManageSpecificMinistry(
  grants: AuthGrant[],
  actorPersonId: string | null | undefined,
  target: MinistryScopeTarget,
): boolean {
  if (
    canManageMemberships(grants, target) ||
    canApprovePastoralAdmission(grants, target)
  ) {
    return true;
  }

  const isLiderInChurch = grants.some(
    (g) =>
      g.roleCode === ROLE_CODES.LIDER_MINISTERIO &&
      (!g.organizationId || g.organizationId === target.organizationId) &&
      (!g.churchId || g.churchId === target.churchId),
  );
  if (!isLiderInChurch) {
    return false;
  }

  const grantCoversMinistry = grants.some(
    (g) =>
      g.roleCode === ROLE_CODES.LIDER_MINISTERIO &&
      (!g.organizationId || g.organizationId === target.organizationId) &&
      (!g.churchId || g.churchId === target.churchId) &&
      g.ministryId === target.ministryId,
  );
  if (grantCoversMinistry) {
    return true;
  }

  return Boolean(
    target.leaderPersonId &&
      actorPersonId &&
      actorPersonId === target.leaderPersonId,
  );
}

/** Criar ministérios / publicar church-wide — não líder de um só ministry. */
export function canAdministerMinistries(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return (
    canManageMemberships(grants, target) ||
    canApprovePastoralAdmission(grants, target)
  );
}

/** PDF da carteirinha: secretaria/admin no escopo, ou titular (person_id). */
export function canAccessCredentialPdf(
  grants: AuthGrant[],
  actorPersonId: string,
  credentialPersonId: string,
  target: MembershipScopeTarget,
): boolean {
  return (
    canManageMemberships(grants, target) ||
    canViewOwnCredential(actorPersonId, credentialPersonId)
  );
}

/**
 * Config OIDC da organização — só PLATFORM_ADMIN na org.
 * Escopo church no grant NÃO bloqueia (OIDC é org-wide).
 */
export function canManageOidcConfig(
  grants: AuthGrant[],
  target: { organizationId: OrganizationId },
): boolean {
  return grants.some((grant) => {
    if (grant.roleCode !== ROLE_CODES.PLATFORM_ADMIN) {
      return false;
    }
    if (
      grant.organizationId &&
      grant.organizationId !== target.organizationId
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Finanças F4: só TESOURARIA no escopo da congregação.
 * SECRETARIA / PASTOR / PLATFORM_ADMIN NÃO operam ledger por padrão (isolamento DAS).
 */
export function canAccessFinance(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return hasAccess(grants, {
    roleCodes: [ROLE_CODES.TESOURARIA],
    organizationId: target.organizationId,
    churchId: target.churchId,
  });
}
