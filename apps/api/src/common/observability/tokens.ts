/** Tokens de DI. O módulo não lê segredo nenhum além da configuração já filtrada. */
export const OBSERVABILITY_CONFIG = Symbol("OBSERVABILITY_CONFIG");
export const OBSERVABILITY_RUNTIME = Symbol("OBSERVABILITY_RUNTIME");
export const LOG_STREAM = Symbol("LOG_STREAM");
export const READINESS_PROBE = Symbol("READINESS_PROBE");
export const RATE_LIMIT_STORE = Symbol("RATE_LIMIT_STORE");
