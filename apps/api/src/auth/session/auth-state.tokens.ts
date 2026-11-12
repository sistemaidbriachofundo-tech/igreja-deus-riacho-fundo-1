/** Tokens de DI. A implementação ativa sai de AUTH_STATE_STORE (memory | prisma). */
export const SESSION_STORE = Symbol("AUTH_SESSION_STORE");
export const MFA_CHALLENGE_STORE = Symbol("AUTH_MFA_CHALLENGE_STORE");
export const AUTH_ATTEMPT_LIMITER = Symbol("AUTH_ATTEMPT_LIMITER");

/** Vercel e produção têm mais de uma instância. Memória não revoga sessão entre elas. */
export function durableAuthRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.IDBRF_RUNTIME_STAGE === "production" || env.VERCEL === "1" || env.F11_REQUIRE_DURABLE_AUTH === "true";
}

export function usesDurableAuthState(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.AUTH_STATE_STORE === "memory") return false;
  if (env.AUTH_STATE_STORE === "prisma") return true;
  return durableAuthRequired(env);
}

export function assertDeployedAuthState(env: NodeJS.ProcessEnv = process.env): void {
  if (env.AUTH_STATE_STORE === "memory" && durableAuthRequired(env)) {
    throw new Error("Sessão em memória é recusada na Vercel e em produção");
  }
}
