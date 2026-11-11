import { ROLE_CODES, type BuiltInRoleCode } from "../rbac";

export const MFA_ENFORCEMENT_MODES = ["OFF", "PRIVILEGED", "ALL"] as const;
export type MfaEnforcementMode = (typeof MFA_ENFORCEMENT_MODES)[number];

/** Papéis que não são membro comum. Combinação com qualquer um deles exige MFA. */
export const PRIVILEGED_ROLE_CODES: readonly BuiltInRoleCode[] = [
  ROLE_CODES.PLATFORM_ADMIN,
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.TESOURARIA,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.EDITOR_SITE,
  ROLE_CODES.PUBLICADOR_SITE,
];

export interface SecurityPolicySnapshot {
  version: number;
  mfaEnforcement: MfaEnforcementMode;
  privilegedRoleCodes: readonly string[];
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicySnapshot = {
  version: 1,
  mfaEnforcement: "PRIVILEGED",
  privilegedRoleCodes: PRIVILEGED_ROLE_CODES,
};

export function requiresPrivilegedMfa(
  policy: SecurityPolicySnapshot,
  roleCodes: readonly string[],
): boolean {
  if (policy.mfaEnforcement === "OFF") return false;
  if (policy.mfaEnforcement === "ALL") return roleCodes.length > 0;
  const privileged = new Set(policy.privilegedRoleCodes);
  return roleCodes.some((role) => privileged.has(role));
}

/**
 * Produção não tem fallback que desliga o desafio.
 * Fora de produção o bloqueio só liga com a flag explícita, para não trancar a QA sintética.
 */
export function mfaBlocksPrivilegedSession(input: {
  stage: string | undefined;
  blockingFlag: string | undefined;
  policy: SecurityPolicySnapshot;
  roleCodes: readonly string[];
}): boolean {
  if (!requiresPrivilegedMfa(input.policy, input.roleCodes)) return false;
  if (input.stage === "production") return true;
  return input.blockingFlag === "true";
}

export function assertRuntimePolicy(
  stage: string | undefined,
  policy: SecurityPolicySnapshot,
): void {
  if (stage === "production" && policy.mfaEnforcement === "OFF") {
    throw new Error("Política MFA desligada é incompatível com produção");
  }
}

export function policyScopeKey(organizationId: string | null | undefined): string {
  if (!organizationId) return "platform";
  return `org:${organizationId}`;
}
