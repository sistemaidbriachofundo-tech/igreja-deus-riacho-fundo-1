import {
  evaluateAccess,
  type AccessAction,
  type AccessResource,
} from "./access-policy";
import type { AuthGrant } from "./rbac";
import type { ChurchId, OrganizationId } from "./ids";

export interface MembershipScopeTarget {
  organizationId: OrganizationId;
  churchId: ChurchId;
}

function allows(
  grants: AuthGrant[],
  target: { organizationId: OrganizationId; churchId?: ChurchId },
  resource: AccessResource,
  action: AccessAction,
  extra?: {
    ministryId?: string | null;
    actorPersonId?: string | null;
    leaderPersonId?: string | null;
  },
): boolean {
  return evaluateAccess(grants, {
    resource,
    action,
    organizationId: target.organizationId,
    churchId: target.churchId,
    ...extra,
  }).allow;
}

/**
 * Secretaria (ou platform admin) pode operar membresia/carteirinha
 * somente no escopo da congregação alvo.
 */
export function canManageMemberships(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return allows(grants, target, "persons", "write");
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

/**
 * Aprovação pastoral na etapa pastor.
 * Modo estrito: só PASTOR. PLATFORM_ADMIN volta com ACCESS_POLICY_MODE=legacy.
 */
export function canApprovePastoralAdmission(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return allows(grants, target, "pastoral", "approve");
}

/** Busca de pessoas (dedupe assistida) — secretaria, pastor ou admin no escopo. */
export function canSearchPersons(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return allows(grants, target, "persons", "search");
}

/**
 * Canais F5 (templates/outbox/consentimento) — secretaria, pastor ou admin.
 * Sem WABA live; só operação administrativa do outbox.
 */
export function canManageChannels(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return canManageMemberships(grants, target) || canApprovePastoralAdmission(grants, target);
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
 * SECRETARIA e PLATFORM_ADMIN não leem por padrão (sigilo DAS).
 */
export function canAccessPastoralCare(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return allows(grants, target, "pastoral", "read");
}

/** Ministérios / escalas / células — líder, secretaria, pastor ou admin (church-wide). */
export function canLeadMinistry(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return allows(grants, target, "ministries", "read");
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
 * LIDER sem ministryId no grant não opera todos os ministérios.
 */
export function canManageSpecificMinistry(
  grants: AuthGrant[],
  actorPersonId: string | null | undefined,
  target: MinistryScopeTarget,
): boolean {
  return allows(grants, target, "ministries", "write", {
    ministryId: target.ministryId,
    actorPersonId,
    leaderPersonId: target.leaderPersonId,
  });
}

/** Criar ministérios / publicar church-wide — não líder de um só ministry. */
export function canAdministerMinistries(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return allows(grants, target, "ministries", "administer");
}

/** PDF da carteirinha: secretaria/admin no escopo, ou titular (person_id). */
export function canAccessCredentialPdf(
  grants: AuthGrant[],
  actorPersonId: string,
  credentialPersonId: string,
  target: MembershipScopeTarget,
): boolean {
  return canManageMemberships(grants, target) || canViewOwnCredential(actorPersonId, credentialPersonId);
}

/**
 * Config OIDC da organização — só PLATFORM_ADMIN na org.
 * Escopo church no grant não bloqueia (OIDC é org-wide).
 */
export function canManageOidcConfig(
  grants: AuthGrant[],
  target: { organizationId: OrganizationId },
): boolean {
  return allows(grants, target, "admin", "administer");
}

/**
 * Finanças F4: só TESOURARIA no escopo da congregação.
 * SECRETARIA / PASTOR / PLATFORM_ADMIN não operam ledger por padrão (isolamento DAS).
 */
export function canAccessFinance(
  grants: AuthGrant[],
  target: MembershipScopeTarget,
): boolean {
  return allows(grants, target, "ledger", "read");
}
