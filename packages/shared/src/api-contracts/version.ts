/**
 * Versão do contrato de API compartilhado (BE ↔ FE).
 * Incrementar MINOR ao adicionar endpoints; MAJOR em breaking change.
 * OpenAPI espelha este valor em `info.version`.
 */
export const API_CONTRACT_VERSION = "0.2.0-f2" as const;

export type ApiContractVersion = typeof API_CONTRACT_VERSION;

/** Prefixos estáveis. */
export const API_PATH_PREFIX = "/api" as const;
