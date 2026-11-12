import { parseTrustedProxies } from "./client-ip";

export type Stage = "dev" | "hml" | "prod" | "test";
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type RateLimitBackend = "memory" | "redis";
export type RateLimitFailMode = "closed" | "open";

export interface RateRuleConfig {
  id: string;
  method: string;
  path: string;
  limit: number;
  windowMs: number;
  code: string;
  message: string;
}

export interface AlertThresholds {
  p95Ms: number;
  errorRatio: number;
  minRequests: number;
  perMinute401: number;
  perMinute403: number;
  perMinute429: number;
}

export interface ObservabilityConfig {
  stage: Stage;
  version: string;
  logLevel: LogLevel;
  logStack: boolean;
  trustedProxies: readonly string[];
  trustedHops: number;
  wireMiddleware: boolean;
  rateLimit: {
    backend: RateLimitBackend;
    failMode: RateLimitFailMode;
    rules: readonly RateRuleConfig[];
    fallback: { limit: number; windowMs: number };
  };
  metricsToken: string | null;
  expectSharedStore: boolean;
  instances: number;
  alerts: AlertThresholds;
}

export interface ObservabilityRuntime {
  config: ObservabilityConfig;
  backend: RateLimitBackend;
  fallback: boolean;
}

const VERSION_SAFE = /^[A-Za-z0-9._-]{1,32}$/;
const DEFAULT_LIMIT_MESSAGE = "Muitas tentativas — aguarde e tente de novo";
const VIVI_LIMIT_MESSAGE = "Limite de mensagens do Riachinho atingido — aguarde um minuto";

/** Lê só as variáveis de observabilidade. Não copia o ambiente inteiro para log. */
export function loadObservabilityConfig(env: NodeJS.ProcessEnv = process.env): ObservabilityConfig {
  const stage = resolveStage(env);
  const limit = intEnv(env.RATE_LIMIT_MAX, 30, 1, 100_000);
  const windowMs = intEnv(env.RATE_LIMIT_WINDOW_MS, 60_000, 100, 3_600_000);
  const version = VERSION_SAFE.test(env.OBSERVABILITY_VERSION ?? "")
    ? (env.OBSERVABILITY_VERSION as string)
    : "0.1.0";
  const metricsToken = (env.OBSERVABILITY_METRICS_TOKEN ?? "").trim();
  return {
    stage,
    version,
    logLevel: resolveLogLevel(env, stage),
    logStack: env.OBSERVABILITY_LOG_STACK === "1",
    trustedProxies: parseTrustedProxies(env.OBSERVABILITY_TRUSTED_PROXIES),
    trustedHops: intEnv(env.OBSERVABILITY_TRUSTED_HOPS, 0, 0, 5),
    wireMiddleware: env.OBSERVABILITY_WIRE_MIDDLEWARE === "1",
    rateLimit: {
      backend: env.OBSERVABILITY_RATE_LIMIT_STORE === "redis" ? "redis" : "memory",
      failMode: env.OBSERVABILITY_RATE_LIMIT_FAIL === "open" ? "open" : "closed",
      rules: defaultRateRules(env, limit, windowMs),
      fallback: { limit, windowMs },
    },
    metricsToken: metricsToken.length >= 16 ? metricsToken : null,
    expectSharedStore: env.OBSERVABILITY_EXPECT_SHARED_STORE === "1",
    instances: intEnv(env.OBSERVABILITY_INSTANCES, 1, 1, 100),
    alerts: {
      p95Ms: intEnv(env.OBSERVABILITY_ALERT_P95_MS, 2000, 1, 60_000),
      errorRatio: ratioEnv(env.OBSERVABILITY_ALERT_ERROR_RATIO, 0.05),
      minRequests: intEnv(env.OBSERVABILITY_ALERT_MIN_REQUESTS, 20, 1, 1_000_000),
      perMinute401: intEnv(env.OBSERVABILITY_ALERT_401_PER_MIN, 30, 1, 100_000),
      perMinute403: intEnv(env.OBSERVABILITY_ALERT_403_PER_MIN, 30, 1, 100_000),
      perMinute429: intEnv(env.OBSERVABILITY_ALERT_429_PER_MIN, 60, 1, 100_000),
    },
  };
}

export function defaultRateRules(
  env: NodeJS.ProcessEnv,
  limit = intEnv(env.RATE_LIMIT_MAX, 30, 1, 100_000),
  windowMs = intEnv(env.RATE_LIMIT_WINDOW_MS, 60_000, 100, 3_600_000),
): RateRuleConfig[] {
  const viviLimit = intEnv(env.VIVI_PUBLIC_RATE_MAX, 8, 1, 100_000);
  const viviWindow = intEnv(env.VIVI_PUBLIC_RATE_WINDOW_MS, 60_000, 100, 3_600_000);
  const standard = (id: string, method: string, path: string): RateRuleConfig => ({
    id,
    method,
    path,
    limit,
    windowMs,
    code: "RATE_LIMITED",
    message: DEFAULT_LIMIT_MESSAGE,
  });
  return [
    standard("login", "POST", "/auth/login"),
    standard("credential", "GET", "/credentials/verify/:opaqueToken"),
    standard("volunteer", "POST", "/public/volunteer-interests"),
    standard("registration", "POST", "/public/events/:slug/registrations"),
    standard("payment-webhook", "POST", "/webhooks/event-payments/mock"),
    {
      id: "vivi-public",
      method: "POST",
      path: "/public/vivi/chat",
      limit: viviLimit,
      windowMs: viviWindow,
      code: "VIVI_RATE_LIMITED",
      message: VIVI_LIMIT_MESSAGE,
    },
  ];
}

function resolveStage(env: NodeJS.ProcessEnv): Stage {
  const explicit = (env.OBSERVABILITY_STAGE ?? "").trim().toLowerCase();
  if (explicit === "dev" || explicit === "development") return "dev";
  if (explicit === "hml" || explicit === "homolog" || explicit === "homologacao" || explicit === "staging") {
    return "hml";
  }
  if (explicit === "prod" || explicit === "production") return "prod";
  if (explicit === "test") return "test";
  if (env.NODE_ENV === "test") return "test";
  if (env.NODE_ENV === "production") return "prod";
  return "dev";
}

function resolveLogLevel(env: NodeJS.ProcessEnv, stage: Stage): LogLevel {
  const raw = (env.OBSERVABILITY_LOG_LEVEL ?? "").trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error" || raw === "silent") {
    return raw;
  }
  return stage === "dev" ? "debug" : "info";
}

function intEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function ratioEnv(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}
