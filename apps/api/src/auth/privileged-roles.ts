import type { AuthGrant } from "@idbrf/shared";

/**
 * Papel comum isento de MFA obrigatório.
 * Com o bloqueio ligado, qualquer outro grant — inclusive papel futuro
 * desconhecido e combinação MEMBRO + privilegiado — exige desafio antes do JWT.
 * Produção não sobe sem F11_MFA_BLOCKING=true.
 * Fora dela a flag fica desligada: o painel atual espera accessToken.
 * mfaRequired no usuário continua exigindo o desafio mesmo com a flag desligada.
 */
const STEP_UP_EXEMPT_ROLES = new Set(["MEMBRO"]);

export function mfaBlockingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.IDBRF_RUNTIME_STAGE === "production") return true;
  return env.F11_MFA_BLOCKING === "true";
}

export function requiresStepUpMfa(
  grants: AuthGrant[],
  mfaRequiredFlag: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (mfaRequiredFlag) return true;
  if (!mfaBlockingEnabled(env)) return false;
  return grants.some((grant) => !STEP_UP_EXEMPT_ROLES.has(grant.roleCode));
}
