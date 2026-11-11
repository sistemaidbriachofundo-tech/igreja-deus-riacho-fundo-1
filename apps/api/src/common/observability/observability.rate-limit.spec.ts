import { loadObservabilityConfig } from "./config";
import {
  MemoryRateLimitStore,
  REDIS_RATE_LIMIT_SCRIPT,
  RateLimiter,
  RedisRateLimitStore,
  createRateLimitStore,
  matchRateRule,
  compileRateRules,
  rateLimitKey,
  rateLimitTopology,
  type RateLimitRedisClient,
} from "./rate-limit";

class FakeRedis implements RateLimitRedisClient {
  readonly keys: string[] = [];
  private readonly counts = new Map<string, { count: number; ttl: number }>();

  async eval(_script: string, _numkeys: number, key: string, windowMs: string): Promise<unknown> {
    this.keys.push(key);
    const ttl = Number(windowMs);
    const current = this.counts.get(key);
    if (!current) {
      this.counts.set(key, { count: 1, ttl });
      return [1, ttl];
    }
    current.count += 1;
    return [current.count, current.ttl];
  }
}

describe("rate limit stores", () => {
  it("enforces the window on one memory store and not across two processes", async () => {
    const left = new RateLimiter(new MemoryRateLimitStore());
    const right = new RateLimiter(new MemoryRateLimitStore());
    expect((await left.consume("same", 1, 60_000, 1_000)).allowed).toBe(true);
    expect((await right.consume("same", 1, 60_000, 1_000)).allowed).toBe(true);
    expect((await left.consume("same", 1, 60_000, 1_000)).allowed).toBe(false);
  });

  it("counts concurrent hits without dropping increments", async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore());
    const results = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume("burst", 5, 60_000, 5_000)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(15);
  });

  it("shares one redis store between instances and does not persist the raw ip", async () => {
    const redis = new FakeRedis();
    const left = new RateLimiter(new RedisRateLimitStore(redis));
    const right = new RateLimiter(new RedisRateLimitStore(redis));
    const key = rateLimitKey("login", "POST", "/auth/login", "203.0.113.50");
    expect((await left.consume(key, 1, 60_000, 1_000)).allowed).toBe(true);
    expect((await right.consume(key, 1, 60_000, 1_000)).allowed).toBe(false);
    expect(redis.keys.length).toBe(2);
    for (const stored of redis.keys) {
      expect(stored).not.toContain("203.0.113.50");
      expect(stored.startsWith("obs:rl:")).toBe(true);
    }
  });

  it("describes the serverless gap of the memory backend", () => {
    const single = rateLimitTopology("memory", 1);
    const many = rateLimitTopology("memory", 3);
    const shared = rateLimitTopology("redis", 3);
    expect(single.shared).toBe(false);
    expect(single.limitsEnforced).toBe(true);
    expect(single.limitation.toLowerCase()).toContain("redis");
    expect(many.limitsEnforced).toBe(false);
    expect(many.limitation.toLowerCase()).toContain("serverless");
    expect(shared.shared).toBe(true);
    expect(shared.limitsEnforced).toBe(true);
  });

  it("falls back to memory when redis was requested without a client", () => {
    const created = createRateLimitStore("redis");
    expect(created.backend).toBe("memory");
    expect(created.fallback).toBe(true);
  });

  it("keeps the vivi route on its own limit and out of the bucket key", () => {
    const rules = compileRateRules(loadObservabilityConfig({
      VIVI_PUBLIC_RATE_MAX: "8",
      RATE_LIMIT_MAX: "30",
    }).rateLimit.rules);
    const vivi = matchRateRule("POST", "/public/vivi/chat?token=sigsecretvalue", rules);
    const login = matchRateRule("POST", "/auth/login", rules);
    expect(vivi?.code).toBe("VIVI_RATE_LIMITED");
    expect(vivi?.limit).toBe(8);
    expect(login?.code).toBe("RATE_LIMITED");
    expect(login?.limit).toBe(30);
    const key = rateLimitKey("credential", "GET", "/credentials/verify/super-secret-token?email=ana@igreja.org", "203.0.113.9");
    expect(key).not.toContain("super-secret-token");
    expect(key).not.toContain("ana@igreja.org");
    expect(key).toContain("/credentials/verify/:id");
  });

  it("ships an atomic redis script", () => {
    expect(REDIS_RATE_LIMIT_SCRIPT).toContain('redis.call("INCR", KEYS[1])');
    expect(REDIS_RATE_LIMIT_SCRIPT).toContain('redis.call("PEXPIRE", KEYS[1], ARGV[1])');
    expect(REDIS_RATE_LIMIT_SCRIPT).toContain('redis.call("PTTL", KEYS[1])');
  });
});
