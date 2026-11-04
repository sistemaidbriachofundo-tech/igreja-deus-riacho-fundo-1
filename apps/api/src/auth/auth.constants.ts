export const JWT_STRATEGY = "jwt" as const;

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
