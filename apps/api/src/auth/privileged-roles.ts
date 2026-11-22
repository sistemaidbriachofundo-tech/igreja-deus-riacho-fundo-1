import type { AuthGrant } from "@idbrf/shared";

/**
 * Papel comum isento de MFA obrigatório.
 * Com o bloqueio ligado, qualquer outro grant — inclusive papel futuro
 * desconhecido e combinação MEMBRO + privilegiado — exige desafio antes do JWT.
 * Produção não sobe sem F11_MFA_BLOCKING=true.
 * Exceção estrita para emails sintéticos de testadores no projeto QA isolado,
 * ativada por flag exclusiva do projeto QA, nunca para pessoas reais.
 * Fora dela a flag fica desligada: o painel atual espera accessToken.
 * mfaRequired no usuário continua exigindo o desafio mesmo com a flag desligada.
 */
const STEP_UP_EXEMPT_ROLES = new Set(["MEMBRO", "CONVIDADO"]);

export function mfaBlockingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.IDBRF_RUNTIME_STAGE === "production") return true;
  return env.F11_MFA_BLOCKING === "true";
}

export function requiresStepUpMfa(
  grants: AuthGrant[],
  mfaRequiredFlag: boolean,
  env: NodeJS.ProcessEnv = process.env,
  email?: string,
): boolean {
  if (mfaRequiredFlag) return true;
  // Conta sintética, domínio reservado e project stage QA: evita exigir TOTP de
  // cada pessoa que testa a tela. Administradores SEMPRE precisam do 2º fator.
  if (env.IDBRF_RUNTIME_STAGE === "qa" && env.F11_QA_TESTER_PASSWORD_ONLY === "true" &&
      /^qa\.rf1\.tester\.[a-z0-9-]+@example\.test$/i.test(email ?? "") &&
      grants.length > 0 && !grants.some(g => g.roleCode === "PLATFORM_ADMIN")) return false;
  if (!mfaBlockingEnabled(env)) return false;
  return grants.some((grant) => !STEP_UP_EXEMPT_ROLES.has(grant.roleCode));
}
