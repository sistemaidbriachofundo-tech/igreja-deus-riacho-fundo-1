import type { AuthGrant } from "@idbrf/shared";

/**
 * Papel comum isento de MFA obrigatório.
 * Qualquer outro grant — inclusive papel futuro desconhecido e combinação
 * MEMBRO + privilegiado — exige desafio antes da sessão.
 * Não há flag para desligar isso.
 */
const STEP_UP_EXEMPT_ROLES = new Set(["MEMBRO"]);

export function requiresStepUpMfa(
  grants: AuthGrant[],
  mfaRequiredFlag: boolean,
): boolean {
  if (mfaRequiredFlag) {
    return true;
  }
  return grants.some((grant) => !STEP_UP_EXEMPT_ROLES.has(grant.roleCode));
}
