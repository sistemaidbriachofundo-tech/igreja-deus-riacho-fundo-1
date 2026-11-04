export const JWT_STRATEGY = "jwt" as const;

/** Comprimento mínimo de JWT_SECRET (produção e secrets não-dev). */
export const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Fallback só para NODE_ENV ≠ production quando JWT_SECRET está ausente/curto.
 * Nunca aceito em produção (resolveJwtSecret rejeita prefixo `dev-only-`).
 */
export const JWT_DEV_FALLBACK_SECRET =
  "dev-only-jwt-secret-change-me-32chars!";

/** Marca rotas públicas (sem JWT). */
export const IS_PUBLIC_KEY = "isPublic";

/** Metadados de papéis exigidos. */
export const ROLES_KEY = "roles";

/** Metadados de escopo (org/igreja) exigidos na rota. */
export const SCOPE_KEY = "scope";

export interface RequiredScopeMeta {
  organizationIdParam?: string;
  churchIdParam?: string;
}
