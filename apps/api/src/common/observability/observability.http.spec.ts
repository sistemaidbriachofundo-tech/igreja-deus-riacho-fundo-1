import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  Post,
  type NestModule,
  UnauthorizedException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";

import { loadObservabilityConfig } from "./config";
import { currentRequestId } from "./context";
import { ObservabilityModule } from "./observability.module";
import { applyObservabilityWiring } from "./wiring";

jest.setTimeout(30_000);

const TOKEN = "metrics-token-test-16";
const SECRETS = [
  "ana@igreja.org",
  "123.456.789-09",
  "s3cret-db-pass",
  "hunter2-senha",
  "sigsecretvalue",
  "db.internal",
];

const testEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  OBSERVABILITY_STAGE: "test",
  OBSERVABILITY_LOG_LEVEL: "info",
  OBSERVABILITY_VERSION: "0.1.0-test",
  OBSERVABILITY_INSTALL_GLOBALS: "1",
  OBSERVABILITY_WIRE_MIDDLEWARE: "1",
  OBSERVABILITY_METRICS_TOKEN: TOKEN,
  OBSERVABILITY_TRUSTED_HOPS: "0",
  OBSERVABILITY_TRUSTED_PROXIES: "10.0.0.0/8",
  VIVI_PUBLIC_RATE_MAX: "2",
  VIVI_PUBLIC_RATE_WINDOW_MS: "60000",
  RATE_LIMIT_MAX: "30",
  RATE_LIMIT_WINDOW_MS: "60000",
};

class LineBuffer {
  readonly lines: string[] = [];
  write(chunk: string): void {
    for (const line of chunk.split("\n")) if (line) this.lines.push(line);
  }
  records(): Array<Record<string, unknown>> {
    return this.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

const lines = new LineBuffer();
const probe = {
  fail: false,
  async check(): Promise<void> {
    if (this.fail) {
      throw new Error(
        "connect ECONNREFUSED postgres://idbrf:s3cret-db-pass@db.internal:5432/app ana@igreja.org 123.456.789-09",
      );
    }
  },
};

@Controller()
class FixtureController {
  @Get("ok")
  ok() {
    return { ok: true };
  }

  @Get("echo")
  async echo() {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { requestId: currentRequestId() ?? null };
  }

  @Get("boom")
  boom() {
    throw new Error(
      "postgres://idbrf:s3cret-db-pass@db.internal:5432/app ana@igreja.org cpf=123.456.789-09 password=hunter2-senha Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sigsecretvalue SELECT email FROM users",
    );
  }

  @Get("denied")
  denied() {
    throw new UnauthorizedException(
      "authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sigsecretvalue",
    );
  }

  @Post("intake")
  intake() {
    return { ok: true };
  }

  @Post("public/vivi/chat")
  chat() {
    return { ok: true };
  }
}

@Module({
  imports: [ObservabilityModule.forRoot({ env: testEnv, stream: lines, probe })],
  controllers: [FixtureController],
})
class FixtureModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    const config = loadObservabilityConfig(testEnv);
    applyObservabilityWiring(consumer, { config, backend: "memory", fallback: false });
  }
}

describe("observability http acceptance", () => {
  let app: INestApplication | undefined;
  let port = 0;

  beforeAll(async () => {
    app = await NestFactory.create(FixtureModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    port = typeof address === "object" && address ? address.port : 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("correlates a safe request id and logs one json line", async () => {
    const before = lines.lines.length;
    const result = await call(port, "/ok", { headers: { "x-request-id": "req_ok_abcd" } });
    await flush();
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("x-request-id")).toBe("req_ok_abcd");
    const added = lines.records().slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      requestId: "req_ok_abcd",
      method: "GET",
      route: "/ok",
      status: 200,
      level: "info",
      event: "http.access",
      stage: "test",
      version: "0.1.0-test",
    });
    expect(String(added[0]?.ts)).toMatch(/Z$/);
  });

  it("replaces a jwt supplied as request id", async () => {
    const result = await call(port, "/ok", {
      headers: { "x-request-id": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sigsecretvalue" },
    });
    await flush();
    const id = result.response.headers.get("x-request-id") ?? "";
    expect(id.startsWith("req_")).toBe(true);
    expect(id).not.toContain("sigsecretvalue");
    expect(lines.lines.join("\n")).not.toContain("sigsecretvalue");
  });

  it("keeps concurrent requests on their own correlation id", async () => {
    const before = lines.lines.length;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => {
        const requestId = `req_cc_${String(index).padStart(2, "0")}abcd`;
        return call(port, "/echo", { headers: { "x-request-id": requestId } }).then((result) => ({
          requestId,
          result,
        }));
      }),
    );
    await flush();
    const ids = results.map((item) => item.requestId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of results) {
      expect(item.result.response.headers.get("x-request-id")).toBe(item.requestId);
      expect(item.result.json).toEqual({ requestId: item.requestId });
    }
    const added = lines.records().slice(before);
    for (const requestId of ids) {
      const matches = added.filter((record) => record.requestId === requestId);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.route).toBe("/echo");
    }
  });

  it("does not leak stack, token, cpf or email on a 500", async () => {
    const before = lines.lines.length;
    const result = await call(port, "/boom", { headers: { "x-request-id": "req_boom_01" } });
    await flush();
    expect(result.response.status).toBe(500);
    expect(result.json).toEqual({
      statusCode: 500,
      message: "Erro interno",
      code: "INTERNAL_ERROR",
      requestId: "req_boom_01",
    });
    const dumped = `${result.text}\n${lines.lines.slice(before).join("\n")}`;
    expect(noSecrets(dumped)).toBe(true);
    expect(result.text).not.toContain("observability.http.spec.ts");
    expect(lines.lines.slice(before).join("\n")).not.toContain("observability.http.spec.ts");
    expect(lines.records().slice(before)[0]).toMatchObject({ level: "error", status: 500, requestId: "req_boom_01" });
  });

  it("turns a credential in a 401 message into a generic denial", async () => {
    const before = lines.lines.length;
    const result = await call(port, "/denied", { headers: { "x-request-id": "req_deny_01" } });
    await flush();
    expect(result.response.status).toBe(401);
    expect(result.json).toMatchObject({
      statusCode: 401,
      message: "Não autorizado",
      code: "UNAUTHORIZED",
      requestId: "req_deny_01",
    });
    const dumped = `${result.text}\n${lines.lines.slice(before).join("\n")}`;
    expect(dumped).not.toContain("sigsecretvalue");
    expect(lines.records().slice(before)[0]).toMatchObject({ level: "warn", status: 401 });
  });

  it("does not log the request body", async () => {
    const before = lines.lines.length;
    const result = await call(port, "/intake", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_body_01",
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sigsecretvalue",
        cookie: "session=hunter2-senha",
      },
      body: JSON.stringify({
        email: "ana@igreja.org",
        password: "hunter2-senha",
        cpf: "123.456.789-09",
      }),
    });
    await flush();
    expect(result.response.status).toBe(201);
    const added = lines.lines.slice(before).join("\n");
    expect(noSecrets(added)).toBe(true);
    expect(added).not.toContain("authorization");
    expect(added).not.toContain("cookie");
    expect(added).not.toContain("password");
  });

  it("answers /internal/observability/ready without internal details", async () => {
    probe.fail = false;
    const ready = await call(port, "/internal/observability/ready");
    await flush();
    expect(ready.response.status).toBe(200);
    expect(ready.json).toEqual({ status: "ready" });
    expect(ready.response.headers.get("cache-control")).toContain("no-store");

    const before = lines.lines.length;
    probe.fail = true;
    const down = await call(port, "/internal/observability/ready", {
      headers: { "x-request-id": "req_ready_1" },
    });
    await flush();
    expect(down.response.status).toBe(503);
    expect(down.json).toEqual({ status: "unavailable" });
    expect(down.response.headers.get("x-request-id")).toBe("req_ready_1");
    const added = lines.lines.slice(before).join("\n");
    expect(noSecrets(added)).toBe(true);
    expect(added).toContain("readiness.failed");
    expect(added).not.toContain("database");
  });

  it("rate limits the peer and ignores a forged X-Forwarded-For", async () => {
    const forged = ["198.51.100.11", "198.51.100.22", "198.51.100.33"];
    const results = [];
    for (const ip of forged) {
      results.push(await call(port, "/public/vivi/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
          "x-request-id": "req_vivi_01",
        },
        body: JSON.stringify({ message: "oi" }),
      }));
    }
    await flush();
    expect(results[0]?.response.status).toBe(201);
    expect(results[1]?.response.status).toBe(201);
    expect(results[2]?.response.status).toBe(429);
    expect(results[2]?.json).toMatchObject({
      statusCode: 429,
      code: "VIVI_RATE_LIMITED",
      message: "Limite de mensagens do Riachinho atingido — aguarde um minuto",
    });
    expect(results[2]?.response.headers.get("retry-after")).toBeTruthy();
    expect(JSON.stringify(results[2]?.json)).not.toContain("stack");
    const dumped = lines.lines.join("\n");
    for (const ip of forged) expect(dumped).not.toContain(ip);
  });

  it("protects the metrics snapshot and exposes aggregate signals only", async () => {
    const missing = await call(port, "/internal/observability/metrics");
    const wrong = await call(port, "/internal/observability/metrics", {
      headers: { "x-observability-token": "wrong-token-value-99" },
    });
    const ok = await call(port, "/internal/observability/metrics", {
      headers: { "x-observability-token": TOKEN },
    });
    await flush();
    expect(missing.response.status).toBe(404);
    expect(wrong.response.status).toBe(404);
    expect(missing.text).not.toContain(TOKEN);
    expect(wrong.text).not.toContain("wrong-token-value-99");
    expect(ok.response.status).toBe(200);
    const body = ok.json as {
      window: { latencyMs: { p50: number | null; p95: number | null }; http5xx: { count: number }; http401: { count: number }; http429: { count: number }; readiness: { lastOk: boolean | null } };
      alerts: Array<{ code: string }>;
      rateLimit: { backend: string; limitation: string };
    };
    expect(body.window.latencyMs.p50).toEqual(expect.any(Number));
    expect(body.window.latencyMs.p95).toEqual(expect.any(Number));
    expect(body.window.http5xx.count).toBeGreaterThan(0);
    expect(body.window.http401.count).toBeGreaterThan(0);
    expect(body.window.http429.count).toBeGreaterThan(0);
    expect(body.window.readiness.lastOk).toBe(false);
    expect(body.alerts.some((alert) => alert.code === "NOT_READY")).toBe(true);
    expect(body.rateLimit.backend).toBe("memory");
    expect(body.rateLimit.limitation.toLowerCase()).toContain("redis");
    expect(ok.text).not.toContain(TOKEN);
    expect(noSecrets(ok.text)).toBe(true);
    expect(lines.lines.join("\n")).not.toContain(TOKEN);
  });
});

function noSecrets(text: string): boolean {
  return SECRETS.every((secret) => !text.includes(secret));
}

async function call(port: number, path: string, init?: RequestInit) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await response.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { response, text, json };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
