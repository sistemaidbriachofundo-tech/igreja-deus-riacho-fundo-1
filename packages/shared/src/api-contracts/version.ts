/**
 * Versão do contrato de API compartilhado (BE ↔ FE).
 * Incrementar MINOR ao adicionar endpoints; MAJOR em breaking change.
 * OpenAPI espelha este valor em `info.version`.
 *
 * 0.3.0-f2 substitui o 0.2.0-f2 (PR #20): o prefixo `/api` estava errado.
 */
export const API_CONTRACT_VERSION = "0.3.0-f2" as const;

export type ApiContractVersion = typeof API_CONTRACT_VERSION;

/**
 * Nest (`apps/api`) não usa prefixo global.
 * Paths OpenAPI são raiz (`/auth/login`, `/memberships`, `/admissions`).
 * O servidor é a origem (`http://localhost:3001`).
 *
 * Concatenar `${origin}${API_PATH_PREFIX}${path}` com `path` começando em `/`.
 * String vazia — não `/api`.
 */
export const API_PATH_PREFIX = "" as const;

/** Monta a URL absoluta de um path raiz do contrato. */
export function joinApiPath(origin: string, path: `/${string}`): string {
  const base = origin.replace(/\/+$/, "");
  if (!path.startsWith("/")) {
    throw new Error("path da API deve começar com /");
  }
  return `${base}${API_PATH_PREFIX}${path}`;
}
