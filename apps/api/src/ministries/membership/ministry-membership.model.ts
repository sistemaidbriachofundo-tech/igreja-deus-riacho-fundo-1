/** Papéis e estados do vínculo formal. Não são papéis de acesso. */

export const FORMAL_ROLES = ["LIDER", "COORDENADOR", "INTEGRANTE", "APOIO"] as const;
export const FORMAL_STATUSES = ["ATIVO", "CONVIDADO", "PAUSADO", "ENCERRADO"] as const;
export const MEMBERSHIP_SOURCES = ["DIRETO", "CONVERSAO_INTERESSE"] as const;

export type FormalRole = (typeof FORMAL_ROLES)[number];
export type FormalStatus = (typeof FORMAL_STATUSES)[number];
export type MembershipSource = (typeof MEMBERSHIP_SOURCES)[number];

export type MembershipScope = {
  organizationId: string;
  churchId: string;
  ministryId: string;
};

/** Linha persistida. Não carrega e-mail, telefone, documento ou nota. */
export type StoredMembership = {
  id: string;
  organizationId: string;
  churchId: string;
  ministryId: string;
  personId: string;
  displayName: string;
  role: FormalRole;
  status: FormalStatus;
  source: MembershipSource;
  volunteerInterestId: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type PublicMember = {
  id: string;
  personId: string;
  displayName: string;
  role: FormalRole;
  status: FormalStatus;
};

export type ScopedPerson = {
  id: string;
  displayName: string;
};

export type ScopedInterest = {
  id: string;
  organizationId: string;
  churchId: string;
  ministryId: string;
  personId: string | null;
  stage: string;
  status: string;
};

export type MembershipAudit = {
  actorUserId: string;
  action: string;
  resourceId: string;
  organizationId: string;
  churchId: string;
  metadata: Record<string, string | null>;
};

const AUDIT_KEYS = [
  "ministryId",
  "personId",
  "role",
  "status",
  "previousStatus",
  "source",
  "volunteerInterestId",
] as const;

export function isFormalRole(value: string): value is FormalRole {
  return (FORMAL_ROLES as readonly string[]).includes(value);
}

export function isFormalStatus(value: string): value is FormalStatus {
  return (FORMAL_STATUSES as readonly string[]).includes(value);
}

export function inScope(row: MembershipScope, scope: MembershipScope): boolean {
  return (
    row.organizationId === scope.organizationId &&
    row.churchId === scope.churchId &&
    row.ministryId === scope.ministryId
  );
}

export function projectMember(row: StoredMembership): PublicMember {
  return {
    id: row.id,
    personId: row.personId,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
  };
}

/** A auditoria fica restrita a identificadores e ao papel do vínculo. */
export function auditMetadata(
  input: Record<string, string | null | undefined>,
): Record<string, string | null> {
  const metadata: Record<string, string | null> = {};
  for (const key of AUDIT_KEYS) {
    const value = input[key];
    if (typeof value === "string" || value === null) metadata[key] = value;
  }
  return metadata;
}
