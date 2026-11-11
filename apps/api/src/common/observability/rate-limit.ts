import { createHash } from "node:crypto";

import type { RateLimitBackend, RateRuleConfig } from "./config";
import { normalizeRoute, stripQuery } from "./route";

export interface RateLimitHit {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<RateLimitHit>;
}

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  resetAt: number;
}

export interface CompiledRateRule extends RateRuleConfig {
  regex: RegExp;
}

/**
 * INCR + PEXPIRE só na primeira hit da janela. A chave que o Redis recebe
 * já é hash: o IP cru não fica no store compartilhado.
 */
export const REDIS_RATE_LIMIT_SCRIPT = [
  'local current = redis.call("INCR", KEYS[1])',
  "if current == 1 then",
  '  redis.call("PEXPIRE", KEYS[1], ARGV[1])',
  "end",
  'local ttl = redis.call("PTTL", KEYS[1])',
  "return {current, ttl}",
].join("\n");

export interface RateLimitRedisClient {
  eval(script: string, numkeys: number, ...args: string[]): Promise<unknown>;
}

const MEMORY_CAP = 10_000;

/**
 * Vale só para este processo. Reinício zera o mapa. Duas instâncias não
 * se enxergam: serverless multi-instância precisa do store compartilhado.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowMs: number, now: number): Promise<RateLimitHit> {
    this.sweep(now);
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && this.buckets.size >= MEMORY_CAP) {
        throw new Error("RATE_LIMIT_STORE_FULL");
      }
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return { count: fresh.count, resetAt: fresh.resetAt };
    }
    current.count += 1;
    return { count: current.count, resetAt: current.resetAt };
  }

  private sweep(now: number): void {
    if (this.buckets.size < 5000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: RateLimitRedisClient,
    private readonly prefix = "obs:rl:",
  ) {}

  async hit(key: string, windowMs: number, now: number): Promise<RateLimitHit> {
    const hashed = createHash("sha256").update(key).digest("hex");
    const raw = await this.client.eval(
      REDIS_RATE_LIMIT_SCRIPT,
      1,
      `${this.prefix}${hashed}`,
      String(windowMs),
    );
    const [countRaw, ttlRaw] = Array.isArray(raw) ? raw : [];
    const count = typeof countRaw === "number" ? countRaw : Number(countRaw);
    const ttl = typeof ttlRaw === "number" ? ttlRaw : Number(ttlRaw);
    if (!Number.isFinite(count) || count < 1) throw new Error("RATE_LIMIT_STORE_INVALID");
    const ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs;
    return { count, resetAt: now + ttlMs };
  }
}

export function createRateLimitStore(
  backend: RateLimitBackend,
  redis?: RateLimitRedisClient,
): { store: RateLimitStore; backend: RateLimitBackend; fallback: boolean } {
  if (backend === "redis" && redis) {
    return { store: new RedisRateLimitStore(redis), backend: "redis", fallback: false };
  }
  return { store: new MemoryRateLimitStore(), backend: "memory", fallback: backend === "redis" };
}

export class RateLimiter {
  constructor(private readonly store: RateLimitStore) {}

  async consume(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateDecision> {
    const hit = await this.store.hit(key, windowMs, now);
    return {
      allowed: hit.count <= limit,
      limit,
      remaining: Math.max(0, limit - hit.count),
      retryAfterMs: Math.max(0, hit.resetAt - now),
      resetAt: hit.resetAt,
    };
  }
}

export function compileRateRules(rules: readonly RateRuleConfig[]): CompiledRateRule[] {
  return rules.map((rule) => ({ ...rule, regex: pathRegex(rule.path) }));
}

export function matchRateRule(
  method: string,
  url: string,
  rules: readonly CompiledRateRule[],
): CompiledRateRule | null {
  const path = stripQuery(url || "/");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  for (const rule of rules) {
    if (rule.method !== "*" && rule.method.toUpperCase() !== method.toUpperCase()) continue;
    if (rule.regex.test(normalized)) return rule;
  }
  return null;
}

/** A chave usa a rota normalizada. O token do path não entra no balde. */
export function rateLimitKey(ruleId: string, method: string, url: string, ip: string): string {
  return `${ruleId}:${method.toUpperCase()}:${normalizeRoute(url)}:${ip}`;
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`obs-ip:${ip}`).digest("hex").slice(0, 12);
}

export function rateLimitTopology(backend: RateLimitBackend, instances: number): {
  shared: boolean;
  limitsEnforced: boolean;
  limitation: string;
} {
  if (backend === "redis") {
    return {
      shared: true,
      limitsEnforced: true,
      limitation: "Redis no VPS compartilha o limite entre instâncias. Sem esse store, serverless multi-instância não segura o abuso.",
    };
  }
  const single = instances <= 1;
  return {
    shared: false,
    limitsEnforced: single,
    limitation: single
      ? "Modo single-instance: o contador vive neste processo e zera no reinício. Duas instâncias ou serverless exigem Redis compartilhado; cada isolate teria o limite cheio de novo."
      : "Modo memória com várias instâncias não aplica o limite global. Serverless multi-instância exige store compartilhado (Redis no mesmo VPS).",
  };
}

function pathRegex(path: string): RegExp {
  const parts = path.split("/").filter((part) => part.length > 0).map((part) => {
    if (part.startsWith(":")) return "[^/]+";
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^/${parts.join("/")}$`, "i");
}
