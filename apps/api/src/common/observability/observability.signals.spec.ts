import { HttpException, ServiceUnavailableException, type ArgumentsHost } from "@nestjs/common";

import { evaluateAlerts, hasCriticalAlert } from "./alerts";
import { loadObservabilityConfig, type ObservabilityRuntime } from "./config";
import { ObservabilityExceptionFilter } from "./exception.filter";
import type { HttpResponseView } from "./http-types";
import { JsonLogger } from "./json-logger";
import { MetricsRegistry, percentile } from "./metrics";
import { toPublicError, toPublicReadiness } from "./public-error";

class LineBuffer {
  readonly lines: string[] = [];
  write(chunk: string): void {
    for (const line of chunk.split("\n")) if (line) this.lines.push(line);
  }
  records(): Array<Record<string, unknown>> {
    return this.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

function runtime(overrides: Partial<ObservabilityRuntime> = {}): ObservabilityRuntime {
  const config = loadObservabilityConfig({
    NODE_ENV: "test",
    OBSERVABILITY_STAGE: "test",
    OBSERVABILITY_LOG_LEVEL: "info",
    OBSERVABILITY_VERSION: "0.1.0-test",
  });
  return { config, backend: "memory", fallback: false, ...overrides };
}

function response(): HttpResponseView & { body?: unknown; headers: Record<string, string> } {
  const res = {
    statusCode: 200,
    locals: {} as Record<string, unknown>,
    headersSent: false,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
  };
  return res;
}

describe("logs, metrics and public errors", () => {
  it("writes one utc json line and drops secrets and unknown fields", () => {
    const lines = new LineBuffer();
    const logger = new JsonLogger(runtime().config, lines, () => new Date("2026-11-11T19:00:00.000Z"));
    logger.write({
      level: "error",
      event: "http.access",
      requestId: "req_ok_abcd",
      method: "POST",
      route: "/auth/login",
      status: 500,
      durationMs: 12.4,
      code: "INTERNAL_ERROR",
      cause: 'ana@igreja.org password=hunter2-senha\n{"level":"debug"}',
      ipHash: "abc123abc123",
      backend: "memory",
    });
    expect(lines.lines).toHaveLength(1);
    const record = lines.records()[0] ?? {};
    expect(record.ts).toBe("2026-11-11T19:00:00.000Z");
    expect(record.level).toBe("error");
    expect(record.stage).toBe("test");
    expect(record.version).toBe("0.1.0-test");
    expect(String(record.cause)).not.toContain("ana@igreja.org");
    expect(String(record.cause)).not.toContain("hunter2-senha");
    expect(record.body).toBeUndefined();
    expect(record.headers).toBeUndefined();
    expect(record.authorization).toBeUndefined();
    expect(record.stack).toBeUndefined();
    const quiet = new JsonLogger(
      loadObservabilityConfig({ OBSERVABILITY_LOG_LEVEL: "warn", OBSERVABILITY_STAGE: "prod" }),
      lines,
    );
    quiet.write({ level: "info", event: "http.access", route: "/ok", status: 200 });
    expect(lines.lines).toHaveLength(1);
  });

  it("computes p50 and p95 without storing routes", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBe(50);
    expect(percentile([], 0.95)).toBeNull();
    let now = 0;
    const metrics = new MetricsRegistry(() => now, 2);
    now = 30_000;
    metrics.recordRequest(200, 10);
    metrics.recordRequest(401, 20);
    metrics.recordRequest(500, 30);
    metrics.recordReadiness(false);
    const snapshot = metrics.snapshot();
    expect(snapshot.requests).toBe(3);
    expect(snapshot.http5xx).toEqual({ count: 1, ratio: 1 / 3 });
    expect(snapshot.http401.perMinute).toBe(2);
    expect(snapshot.latencyMs.p95).toBe(30);
    expect(snapshot.readiness.lastOk).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("/auth");
  });

  it("raises practical alerts for errors, auth spikes and a missing shared store", () => {
    const snapshot = new MetricsRegistry().snapshot();
    const noisy = {
      ...snapshot,
      requests: 40,
      latencyMs: { p50: 10, p95: 2500 },
      http5xx: { count: 8, ratio: 0.2 },
      http401: { count: 100, perMinute: 80 },
      http403: { count: 0, perMinute: 0 },
      http429: { count: 0, perMinute: 0 },
      readiness: { ok: 0, unavailable: 1, lastOk: false as const },
    };
    const alerts = evaluateAlerts({
      snapshot: noisy,
      thresholds: loadObservabilityConfig({}).alerts,
      backend: "memory",
      expectSharedStore: true,
      fallback: true,
    });
    expect(alerts.map((alert) => alert.code)).toEqual([
      "LATENCY_P95",
      "HTTP_5XX",
      "HTTP_401",
      "NOT_READY",
      "RATE_LIMIT_NOT_SHARED",
      "RATE_LIMIT_MEMORY_FALLBACK",
    ]);
    expect(hasCriticalAlert(alerts)).toBe(true);
    expect(JSON.stringify(alerts)).not.toContain("@");
  });

  it("hides stack and pii from the client and from the log line", () => {
    const lines = new LineBuffer();
    const active = runtime();
    const logger = new JsonLogger(active.config, lines);
    const filter = new ObservabilityExceptionFilter(logger, new MetricsRegistry(), active);
    const res = response();
    const error = new Error("postgres://idbrf:s3cret-db-pass@db.internal:5432/app ana@igreja.org 123.456.789-09");
    filter.catch(error, host(res));
    const body = res.body as Record<string, unknown>;
    expect(res.statusCode).toBe(500);
    expect(Object.keys(body).sort()).toEqual(["code", "message", "requestId", "statusCode"]);
    expect(body).toMatchObject({ message: "Erro interno", code: "INTERNAL_ERROR" });
    const serialized = `${JSON.stringify(body)}\n${lines.lines.join("\n")}`;
    for (const secret of ["s3cret-db-pass", "ana@igreja.org", "123.456.789-09", "db.internal", "observability.signals.spec.ts"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("preserves a safe business message and strips a poisoned readiness payload", () => {
    expect(toPublicError({
      status: 429,
      message: "Limite de mensagens do Riachinho atingido — aguarde um minuto",
      code: "VIVI_RATE_LIMITED",
      requestId: "req_ok_abcd",
    })).toMatchObject({
      code: "VIVI_RATE_LIMITED",
      message: "Limite de mensagens do Riachinho atingido — aguarde um minuto",
    });
    expect(toPublicReadiness(true)).toEqual({ status: "ready" });
    const lines = new LineBuffer();
    const active = runtime();
    const filter = new ObservabilityExceptionFilter(
      new JsonLogger(active.config, lines),
      new MetricsRegistry(),
      active,
    );
    const legacy = response();
    filter.catch(new ServiceUnavailableException({
      status: "unavailable",
      service: "api",
      database: "unavailable",
    }), host(legacy));
    expect(legacy.statusCode).toBe(503);
    expect(legacy.body).toEqual({ status: "unavailable", service: "api", database: "unavailable" });

    const poisoned = response();
    filter.catch(new HttpException({
      status: "unavailable",
      service: "api",
      database: "unavailable",
      message: "postgres://idbrf:s3cret-db-pass@db.internal:5432/app",
    }, 503), host(poisoned));
    expect(poisoned.body).toEqual({ status: "unavailable" });
    expect(JSON.stringify(poisoned.body)).not.toContain("s3cret-db-pass");
    expect(lines.lines.join("\n")).not.toContain("s3cret-db-pass");
  });

  it("selects stage and log level for dev, hml and prod", () => {
    expect(loadObservabilityConfig({}).stage).toBe("dev");
    expect(loadObservabilityConfig({}).logLevel).toBe("debug");
    expect(loadObservabilityConfig({ NODE_ENV: "production" }).stage).toBe("prod");
    expect(loadObservabilityConfig({ NODE_ENV: "production" }).logLevel).toBe("info");
    const hml = loadObservabilityConfig({
      NODE_ENV: "production",
      OBSERVABILITY_STAGE: "hml",
      OBSERVABILITY_LOG_LEVEL: "warn",
      OBSERVABILITY_METRICS_TOKEN: "short",
      OBSERVABILITY_RATE_LIMIT_FAIL: "open",
    });
    expect(hml.stage).toBe("hml");
    expect(hml.logLevel).toBe("warn");
    expect(hml.metricsToken).toBeNull();
    expect(hml.rateLimit.failMode).toBe("open");
    expect(hml.wireMiddleware).toBe(false);
  });
});

function host(res: HttpResponseView): ArgumentsHost {
  return {
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => ({ method: "GET", url: "/ready", headers: {}, socket: {} }),
      getResponse: () => res,
      getNext: () => undefined,
    }),
  } as ArgumentsHost;
}
