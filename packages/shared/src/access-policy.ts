import { grantMatchesScope, ROLE_CODES, type AuthGrant, type BuiltInRoleCode } from "./rbac";

/**
 * Política A3 — matriz explícita papel × recurso × ação.
 * Célula ausente = negação. Nenhum papel herda o de outro.
 * PLATFORM_ADMIN não recebe pastoral nem ledger por ser admin.
 * EDITOR_SITE e PUBLICADOR_SITE não recebem secretaria (persons).
 *
 * Rollback operacional: ACCESS_POLICY_MODE=legacy reativa só as
 * células `legacyOnly` (hoje: aprovação pastoral pelo admin técnico).
 */
export const ACCESS_POLICY_VERSION = "2026-11-09.a3.1" as const;

export const ACCESS_POLICY_MODE_ENV = "ACCESS_POLICY_MODE" as const;

export const ACCESS_RESOURCES = [
  "persons",
  "pastoral",
  "ledger",
  "ministries",
  "cms",
  "admin",
  "audit",
] as const;

export const ACCESS_ACTIONS = [
  "read",
  "search",
  "write",
  "publish",
  "approve",
  "administer",
  "respond",
] as const;

export type AccessResource = (typeof ACCESS_RESOURCES)[number];
export type AccessAction = (typeof ACCESS_ACTIONS)[number];
export type AccessScopeKind = "church" | "ministry" | "self" | "org";
export type AccessPolicyMode = "strict" | "legacy";
export type AccessDenialCode =
  | "ALLOW"
  | "NO_RULE"
  | "TENANT_MISMATCH"
  | "SELF_ONLY"
  | "MINISTRY_MISMATCH";

export interface AccessRule {
  resource: AccessResource;
  action: AccessAction;
  roleCode: BuiltInRoleCode;
  scope: AccessScopeKind;
  /** Só entra na decisão quando ACCESS_POLICY_MODE=legacy. */
  legacyOnly?: boolean;
}

export interface AccessRequest {
  resource: AccessResource;
  action: AccessAction;
  organizationId?: string | null;
  churchId?: string | null;
  ministryId?: string | null;
  actorPersonId?: string | null;
  subjectPersonId?: string | null;
  leaderPersonId?: string | null;
  /**
   * O guard HTTP não consulta o líder titular no banco.
   * `allow` libera grant de líder sem ministryId; grant com ministryId
   * diferente do recurso continua negado.
   */
  unknownLeader?: "allow" | "deny";
  /**
   * Token antigo sem congregação ativa. Não escolhe outra igreja:
   * só evita negar grant church-scoped quando o alvo não veio na request.
   */
  relaxedTenant?: boolean;
  mode?: AccessPolicyMode;
}

export interface AccessDecision {
  allow: boolean;
  code: AccessDenialCode;
  roleCode?: BuiltInRoleCode;
  scope?: AccessScopeKind;
}

export interface ImplicitGrantFinding {
  id: string;
  status: "CLOSED" | "BLOCKED" | "KEPT";
  summary: string;
}

function rule(
  resource: AccessResource,
  action: AccessAction,
  scope: AccessScopeKind,
  roles: readonly BuiltInRoleCode[],
  legacyOnly = false,
): AccessRule[] {
  return roles.map((roleCode) => ({
    resource,
    action,
    roleCode,
    scope,
    ...(legacyOnly ? { legacyOnly: true } : {}),
  }));
}

const CHURCH_STAFF = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

const MINISTRY_LEAD = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
  ROLE_CODES.LIDER_MINISTERIO,
] as const;

const CMS_EDITORS = [
  ROLE_CODES.EDITOR_SITE,
  ROLE_CODES.PUBLICADOR_SITE,
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.PLATFORM_ADMIN,
  ROLE_CODES.LIDER_MINISTERIO,
] as const;

/**
 * Matriz formal. A ordem não concede prioridade: qualquer célula
 * compatível com um grant autoriza.
 */
export const ACCESS_MATRIX: readonly AccessRule[] = [
  ...rule("persons", "read", "church", [
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  ]),
  ...rule("persons", "read", "self", [ROLE_CODES.MEMBRO]),
  ...rule("persons", "search", "church", [
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  ]),
  ...rule("persons", "write", "church", [
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PLATFORM_ADMIN,
  ]),

  ...rule("pastoral", "read", "church", [ROLE_CODES.PASTOR]),
  ...rule("pastoral", "write", "church", [ROLE_CODES.PASTOR]),
  ...rule("pastoral", "approve", "church", [ROLE_CODES.PASTOR]),
  ...rule("pastoral", "approve", "church", [ROLE_CODES.PLATFORM_ADMIN], true),

  ...rule("ledger", "read", "church", [ROLE_CODES.TESOURARIA]),
  ...rule("ledger", "write", "church", [ROLE_CODES.TESOURARIA]),

  ...rule("ministries", "read", "church", MINISTRY_LEAD),
  ...rule("ministries", "write", "church", [
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  ]),
  ...rule("ministries", "write", "ministry", [ROLE_CODES.LIDER_MINISTERIO]),
  ...rule("ministries", "administer", "church", [
    ROLE_CODES.SECRETARIA,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  ]),
  ...rule("ministries", "respond", "church", [
    ...MINISTRY_LEAD,
    ROLE_CODES.MEMBRO,
  ]),

  ...rule("cms", "read", "church", CMS_EDITORS),
  ...rule("cms", "write", "church", CMS_EDITORS),
  ...rule("cms", "publish", "church", [
    ROLE_CODES.PUBLICADOR_SITE,
    ROLE_CODES.PASTOR,
    ROLE_CODES.PLATFORM_ADMIN,
  ]),

  ...rule("admin", "administer", "org", [ROLE_CODES.PLATFORM_ADMIN]),

  ...rule("audit", "read", "church", CHURCH_STAFF),
];

/**
 * Achados da investigação de grant implícito e de lockout.
 * CLOSED: a matriz estrita (ou o guard) passa a negar.
 * BLOCKED: o conserto mora em API de negócio de outra frente.
 * KEPT: célula explícita mantida para não travar a operação.
 */
export const IMPLICIT_GRANT_FINDINGS: readonly ImplicitGrantFinding[] = [
  {
    id: "pastoral-admin-approve",
    status: "CLOSED",
    summary:
      "Aprovação pastoral da admissão deixa de acompanhar PLATFORM_ADMIN no modo estrito. PASTOR segue autorizado. ACCESS_POLICY_MODE=legacy restaura o admin técnico.",
  },
  {
    id: "unauthenticated-was-403",
    status: "CLOSED",
    summary:
      "RolesGuard, ScopeGuard e AccessPolicyGuard respondem 401 quando não há usuário autenticado. Papel ou escopo insuficiente continua 403.",
  },
  {
    id: "scope-guard-any-role",
    status: "CLOSED",
    summary:
      "RequireScope sem @Roles deixou de aceitar qualquer papel do token. No modo estrito a rota fecha. No modo legacy volta o fallback anterior. Nenhuma rota de produção usa RequireScope hoje.",
  },
  {
    id: "lider-coarse-church-gate",
    status: "BLOCKED",
    summary:
      "Grant de LIDER_MINISTERIO com ministryId ainda satisfaz ministries.read na congregação, porque listagens e groups/courses/discipleship usam canLeadMinistry como portão de entrada. A linha é filtrada em ministries; o corte fino nos outros services é contrato da frente de ministérios.",
  },
  {
    id: "cms-contents-site-roles",
    status: "BLOCKED",
    summary:
      "A matriz autoriza EDITOR_SITE e PUBLICADOR_SITE a ler e gravar cms. O controller cms/contents ainda lista só secretaria, pastor, líder e admin, então o guard de papéis responde 403 antes da matriz. site-layout e site-media já incluem os papéis de site. Alinhar cms/contents é API de negócio.",
  },
  {
    id: "indicators-pastoral-count",
    status: "CLOSED",
    summary:
      "GET /indicators/summary omite pastoralOpen para quem não tem célula pastoral, inclusive PLATFORM_ADMIN. O campo é opcional no DTO e zero não substitui a omissão.",
  },
  {
    id: "audit-metadata-echo",
    status: "CLOSED",
    summary:
      "A leitura de audit_logs redige metadata que cita cuidado pastoral ou lançamento financeiro para o leitor sem essa célula. A trilha da ação permanece.",
  },
  {
    id: "platform-admin-persons-explicit",
    status: "KEPT",
    summary:
      "persons.read/search/write de PLATFORM_ADMIN é célula nomeada, usada por membresia e pelo break-glass técnico. A célula não abre pastoral nem ledger. Secretaria continua o caminho ordinário de ficha.",
  },
];

export function resolveAccessPolicyMode(
  raw?: string | null,
): AccessPolicyMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "legacy") {
    return "legacy";
  }
  return "strict";
}

export function currentAccessPolicyMode(): AccessPolicyMode {
  const fromEnv =
    typeof process !== "undefined" ? process.env[ACCESS_POLICY_MODE_ENV] : undefined;
  return resolveAccessPolicyMode(fromEnv);
}

export function accessRulesForMode(mode: AccessPolicyMode): readonly AccessRule[] {
  if (mode === "legacy") {
    return ACCESS_MATRIX;
  }
  return ACCESS_MATRIX.filter((cell) => !cell.legacyOnly);
}

export function formatAccessMatrix(mode: AccessPolicyMode = "strict"): string[] {
  return accessRulesForMode(mode).map((cell) => {
    const flag = cell.legacyOnly ? " legacy" : "";
    return `${cell.roleCode} ${cell.resource}.${cell.action} ${cell.scope}${flag}`;
  });
}

export function evaluateAccess(
  grants: readonly AuthGrant[],
  request: AccessRequest,
): AccessDecision {
  const mode = request.mode ?? currentAccessPolicyMode();
  const cells = accessRulesForMode(mode).filter(
    (cell) => cell.resource === request.resource && cell.action === request.action,
  );
  if (cells.length === 0) {
    return { allow: false, code: "NO_RULE" };
  }

  let sawSelf = false;
  let sawMinistry = false;
  let sawTenant = false;

  for (const grant of grants) {
    const matching = cells.filter((cell) => cell.roleCode === grant.roleCode);
    for (const cell of matching) {
      const fit = scopeFits(cell, grant, request);
      if (fit === "allow") {
        return {
          allow: true,
          code: "ALLOW",
          roleCode: cell.roleCode,
          scope: cell.scope,
        };
      }
      if (fit === "self") {
        sawSelf = true;
      } else if (fit === "ministry") {
        sawMinistry = true;
      } else if (fit === "tenant") {
        sawTenant = true;
      }
    }
  }

  if (sawSelf) {
    return { allow: false, code: "SELF_ONLY" };
  }
  if (sawMinistry) {
    return { allow: false, code: "MINISTRY_MISMATCH" };
  }
  if (sawTenant) {
    return { allow: false, code: "TENANT_MISMATCH" };
  }
  return { allow: false, code: "NO_RULE" };
}

type ScopeFit = "allow" | "self" | "ministry" | "tenant";

function scopeFits(
  cell: AccessRule,
  grant: AuthGrant,
  request: AccessRequest,
): ScopeFit {
  if (cell.scope === "org") {
    return orgCovers(grant, request) ? "allow" : "tenant";
  }
  if (!churchCovers(grant, request)) {
    return "tenant";
  }
  if (cell.scope === "church") {
    return "allow";
  }
  if (cell.scope === "self") {
    if (
      request.actorPersonId &&
      request.subjectPersonId &&
      request.actorPersonId === request.subjectPersonId
    ) {
      return "allow";
    }
    return "self";
  }
  return ministryCovers(grant, request);
}

function churchCovers(grant: AuthGrant, request: AccessRequest): boolean {
  if (request.relaxedTenant && !request.churchId) {
    if (
      request.organizationId &&
      grant.organizationId &&
      grant.organizationId !== request.organizationId
    ) {
      return false;
    }
    return true;
  }
  return grantMatchesScope(grant, {
    roleCodes: [grant.roleCode],
    organizationId: request.organizationId,
    churchId: request.churchId,
  });
}

function orgCovers(grant: AuthGrant, request: AccessRequest): boolean {
  if (
    grant.organizationId &&
    request.organizationId &&
    grant.organizationId !== request.organizationId
  ) {
    return false;
  }
  return true;
}

function ministryCovers(grant: AuthGrant, request: AccessRequest): ScopeFit {
  if (request.ministryId && grant.ministryId === request.ministryId) {
    return "allow";
  }
  if (
    request.leaderPersonId &&
    request.actorPersonId &&
    request.leaderPersonId === request.actorPersonId
  ) {
    return "allow";
  }
  if (request.ministryId && grant.ministryId && grant.ministryId !== request.ministryId) {
    return "ministry";
  }
  if (request.ministryId && !grant.ministryId) {
    if ((request.unknownLeader ?? "deny") === "allow") {
      return "allow";
    }
    return "ministry";
  }
  return "allow";
}
