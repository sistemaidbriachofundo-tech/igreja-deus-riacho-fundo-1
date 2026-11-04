/**
 * Versão do contrato de API compartilhado (BE ↔ FE).
 * Incrementar MINOR ao adicionar endpoints; MAJOR em breaking change.
 * OpenAPI espelha este valor em `info.version`.
 */
export const API_CONTRACT_VERSION = "0.2.1-f2" as const;

export type ApiContractVersion = typeof API_CONTRACT_VERSION;

/**
 * Prefixo HTTP real da API Nest nesta fase.
 * Nest escuta na raiz (`/auth/login`, `/memberships`, …) — sem global prefix `/api`.
 * `NEXT_PUBLIC_API_URL` já aponta para a origem (ex.: http://localhost:3001).
 */
export const API_PATH_PREFIX = "" as const;
