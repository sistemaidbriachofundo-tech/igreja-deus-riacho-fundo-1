import { HealthService } from "./health.service";

describe("HealthService", () => {
  const service = new HealthService();

  it("returns ok health", () => {
    const health = service.getHealth();
    expect(health.status).toBe("ok");
    expect(health.service).toBe("api");
    expect(health.app).toContain("Igreja de Deus");
  });

  it("returns hello message", () => {
    const hello = service.getHello();
    expect(hello.message).toContain("Olá");
  });
});
