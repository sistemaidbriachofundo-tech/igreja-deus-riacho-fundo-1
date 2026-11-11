import { ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { HealthService } from "./health.service";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("HealthService", () => {
  const query = jest.fn();
  const service = new HealthService({ $queryRaw: query } as unknown as PrismaService);

  it("returns ok health", () => {
    const health = service.getHealth();
    expect(health.status).toBe("ok");
    expect(health.service).toBe("api");
    expect(health.app).toContain("Igreja de Deus");
  });

  it("returns readiness only when Postgres answers", async () => {
    const previousBlocking = process.env.F11_MFA_BLOCKING;
    const previousStore = process.env.AUTH_STATE_STORE;
    const previousVercel = process.env.VERCEL;
    const previousStage = process.env.IDBRF_RUNTIME_STAGE;
    delete process.env.F11_MFA_BLOCKING;
    delete process.env.AUTH_STATE_STORE;
    delete process.env.VERCEL;
    delete process.env.IDBRF_RUNTIME_STAGE;
    delete process.env.F11_REQUIRE_DURABLE_AUTH;
    query.mockResolvedValueOnce([{ "?column?": 1 }]);
    try {
    await expect(service.getReadiness()).resolves.toEqual({
      status: "ready",
      service: "api",
      database: "ok",
      commit: null,
      authState: "memory",
      mfaBlocking: false,
    });
    } finally {
      restoreEnv("F11_MFA_BLOCKING", previousBlocking);
      restoreEnv("AUTH_STATE_STORE", previousStore);
      restoreEnv("VERCEL", previousVercel);
      restoreEnv("IDBRF_RUNTIME_STAGE", previousStage);
    }
  });

  it("returns 503 readiness when Postgres is unavailable", async () => {
    query.mockRejectedValueOnce(new Error("DB unreachable"));
    await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("returns hello message", () => {
    const hello = service.getHello();
    expect(hello.message).toContain("Olá");
  });
});
