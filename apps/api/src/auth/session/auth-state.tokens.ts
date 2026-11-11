/** Tokens de DI. A implementação ativa sai de AUTH_STATE_STORE (memory | prisma). */
export const SESSION_STORE = Symbol("AUTH_SESSION_STORE");
export const MFA_CHALLENGE_STORE = Symbol("AUTH_MFA_CHALLENGE_STORE");
export const AUTH_ATTEMPT_LIMITER = Symbol("AUTH_ATTEMPT_LIMITER");

export function usesDurableAuthState(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.AUTH_STATE_STORE === "prisma";
}
