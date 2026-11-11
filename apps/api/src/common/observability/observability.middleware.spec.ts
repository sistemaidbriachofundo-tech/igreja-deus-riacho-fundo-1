import { loadObservabilityConfig, type ObservabilityRuntime } from "./config";
import { JsonLogger } from "./json-logger";
import { MetricsRegistry } from "./metrics";
import { MemoryRateLimitStore, RateLimiter } from "./rate-limit";
import { ObservabilityRateLimitMiddleware } from "./rate-limit.middleware";
import { applyObservabilityWiring } from "./wiring";

class LineBuffer {
  readonly lines: string[] = [];
  write(chunk: string): void {
    for (const line of chunk.split("\n")) if (line) this.lines.push(line);
  }
  records(): Array<Record<string, unknown>> {
    return this.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

function mockRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    locals: {} as Record<string, unknown>,
    headersSent: false,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    body: undefined as unknown,
  };
  return { res, headers };
}

describe("trusted-proxy rate limit middleware", () => {
  const lines = new LineBuffer();
  const config = loadObservabilityConfig({
    NODE_ENV: "test",
    OBSERVABILITY_STAGE: "test",
    OBSERVABILITY_LOG_LEVEL: "info",
    OBSERVABILITY_TRUSTED_PROXIES: "10.0.0.0/8",
    OBSERVABILITY_TRUSTED_HOPS: "1",
    RATE_LIMIT_MAX: "1",
    RATE_LIMIT_WINDOW_MS: "60000",
    VIVI_PUBLIC_RATE_MAX: "1",
  });
  const runtime: ObservabilityRuntime = { config, backend: "memory", fallback: false };
  const middleware = new ObservabilityRateLimitMiddleware(
    new RateLimiter(new MemoryRateLimitStore()),
    new JsonLogger(config, lines),
    new MetricsRegistry(),
    runtime,
  );

  function request(peer: string, forwarded: string) {
    return {
      method: "POST",
      originalUrl: "/auth/login?token=sigsecretvalue",
      headers: { "x-forwarded-for": forwarded },
      socket: { remoteAddress: peer },
      ip: peer,
    };
  }

  it("limits the client seen by the proxy, not the forged left-most address", async () => {
    const first = mockRes();
    const next = jest.fn();
    await middleware.use(request("10.0.0.5", "1.2.3.4, 203.0.113.50"), first.res, next);
    expect(next).toHaveBeenCalledTimes(1);

    const forged = mockRes();
    await middleware.use(request("10.0.0.5", "198.51.100.8, 203.0.113.50"), forged.res, jest.fn());
    expect(forged.res.statusCode).toBe(429);
    expect(forged.res.body).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
    expect(forged.headers["retry-after"]).toBeDefined();
    expect(JSON.stringify(forged.res.body)).not.toContain("203.0.113.50");
    expect(lines.lines.join("\n")).not.toContain("203.0.113.50");
    expect(lines.lines.join("\n")).not.toContain("sigsecretvalue");

    const otherClient = mockRes();
    const otherNext = jest.fn();
    await middleware.use(request("10.0.0.5", "198.51.100.20"), otherClient.res, otherNext);
    expect(otherNext).toHaveBeenCalledTimes(1);
  });

  it("ignores X-Forwarded-For from a direct, untrusted peer", async () => {
    const direct = new ObservabilityRateLimitMiddleware(
      new RateLimiter(new MemoryRateLimitStore()),
      new JsonLogger(config, lines),
      new MetricsRegistry(),
      runtime,
    );
    const next = jest.fn();
    const res = mockRes();
    await direct.use(request("203.0.113.9", "198.51.100.10"), res.res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const again = mockRes();
    await direct.use(request("203.0.113.9", "198.51.100.99"), again.res, jest.fn());
    expect(again.res.statusCode).toBe(429);
  });

  it("fails closed when the store throws, without logging the redis secret", async () => {
    const broken = new ObservabilityRateLimitMiddleware(
      new RateLimiter({
        async hit() {
          throw new Error("connect redis://default:s3cret-db-pass@10.9.9.9:6379");
        },
      }),
      new JsonLogger(config, lines),
      new MetricsRegistry(),
      runtime,
    );
    const res = mockRes();
    await broken.use(request("10.0.0.5", "203.0.113.8"), res.res, jest.fn());
    expect(res.res.statusCode).toBe(503);
    expect(res.res.body).toMatchObject({ message: "Erro interno", code: "INTERNAL_ERROR" });
    const dumped = `${JSON.stringify(res.res.body)}\n${lines.lines.join("\n")}`;
    expect(dumped).not.toContain("s3cret-db-pass");
    expect(dumped).not.toContain("10.9.9.9");
    expect(lines.records().some((record) => record.code === "RATE_LIMIT_UNAVAILABLE")).toBe(true);
  });

  it("wires middleware only when the root module turns the flag on", () => {
    const applied: string[] = [];
    const consumer = {
      apply(token: { name: string }) {
        applied.push(token.name);
        return { forRoutes: () => consumer };
      },
    };
    applyObservabilityWiring(consumer as never, runtime);
    expect(applied).toEqual([]);
    applyObservabilityWiring(consumer as never, {
      ...runtime,
      config: { ...runtime.config, wireMiddleware: true },
    });
    expect(applied).toEqual(["CorrelationMiddleware", "ObservabilityRateLimitMiddleware"]);
  });
});
