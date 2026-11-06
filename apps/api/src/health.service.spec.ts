import { ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { HealthService } from "./health.service";

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
    query.mockResolvedValueOnce([{ "?column?": 1 }]);
    await expect(service.getReadiness()).resolves.toEqual({
      status: "ready", service: "api", database: "ok",
    });
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
